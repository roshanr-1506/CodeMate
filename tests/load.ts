import { writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { io as socketClient, type Socket } from 'socket.io-client';
import { Database } from '../backend/src/db.js';
import { createApp } from '../backend/src/app.js';
import { registerRoutes } from '../backend/src/routes.js';
import { realtime } from '../backend/src/realtime.js';
import { AnalysisWorker } from '../backend/src/workers/analysis.js';
import { seed } from '../scripts/seed.js';
import assert from 'node:assert/strict';
const count = Number(process.env.LOAD_TEAMS ?? 100);
if (!Number.isInteger(count) || count < 2 || count > 250) throw Error('LOAD_TEAMS must be 2–250.');
// Always isolated. Never run load data against the competition database.
const db = new Database('', true);
await db.migrate();
await seed(db, 'load-test-only-password', count);
const runtime = createApp(db, {
    secret: 'load-test-only-secret-with-sufficient-length',
    origin: 'http://localhost:5173',
    idleSeconds: 900,
  }),
  services = registerRoutes(runtime.app, runtime.core);
runtime.errors();
const server = createServer(runtime.app),
  rt = realtime(server, runtime.core, runtime.auth, services.chess, 'http://localhost:5173'),
  worker = new AnalysisWorker(runtime.core, services.ledger, services.chess, { workers: 2 });
const sockets: Socket[] = [];
const timings: number[] = [];
let scoreMessages = 0;
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const url = 'http://127.0.0.1:' + (server.address() as any).port;
const timed = async <T>(fn: () => Promise<T>) => {
  const start = performance.now();
  const result = await fn();
  timings.push(performance.now() - start);
  return result;
};
try {
  console.log('Preparing ' + count + ' teams and ' + count * 2 + ' authenticated sessions…');
  const teams: any[] = [];
  const tokens: string[] = [];
  async function httpLogin(identifier: string, role: string) {
    const r = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, role, password: 'load-test-only-password' }),
    });
    assert.equal(r.status, 200, 'HTTP login denied');
    const result = await r.json();
    const cookie = r.headers.getSetCookie().find((c) => c.startsWith('cm_session='))!;
    const token = cookie.split(';')[0].slice('cm_session='.length);
    tokens.push(token);
    return { ...result, token };
  }
  for (let i = 1; i <= count; i++) {
    const id = 'TEAM-' + String(i).padStart(3, '0');
    const c = await httpLogin(id, 'CHESS'),
      d = await httpLogin(id, 'DEBUGGING');
    teams.push({ c: c.session, d: d.session });
    for (const login of [c, d]) {
      const socket = socketClient(url, {
        autoConnect: false,
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://localhost:5173', Cookie: 'cm_session=' + login.token },
      });
      sockets.push(socket);
      socket.on('team:score_updated', () => scoreMessages++);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Socket connection timed out')), 10000);
        socket.once('connect', () => {
          clearTimeout(timer);
          resolve();
        });
        socket.once('connect_error', reject);
        socket.connect();
      });
    }
    if (i % 25 === 0) console.log('Connected ' + i * 2 + ' users.');
  }
  assert.equal(rt.io.engine.clientsCount, count * 2);
  await Promise.all(
    tokens.map((token) =>
      timed(async () => {
        const r = await fetch(url + '/api/team', { headers: { Cookie: 'cm_session=' + token } });
        assert.equal(r.status, 200, 'Authenticated same-network HTTP read denied');
      }),
    ),
  );
  console.log('All ' + tokens.length + ' same-network HTTP clients succeeded.');
  console.log('Running concurrent point updates and purchases…');
  await Promise.all(
    teams.map(({ c }) =>
      db.tx((q) =>
        services.ledger.adjustPoints(q, {
          teamId: c.team_id,
          type: 'BONUS',
          source: 'ADMIN',
          amount: 500,
          referenceId: 'load-seed',
          operationId: 'load-fund:' + c.team_id,
          description: 'Isolated load-test funding',
        }),
      ),
    ),
  );
  await Promise.all(
    teams.flatMap(({ c, d }) => [
      timed(() =>
        db.tx((q) =>
          services.ledger.awardPoints(q, {
            teamId: c.team_id,
            type: 'CHESS_RESULT',
            source: 'CHESS',
            amount: 100,
            referenceId: 'load-concurrency',
            operationId: 'load-award:' + c.team_id,
            description: 'Isolated concurrent credit',
          }),
        ),
      ),
      timed(() => services.shop.purchase(d, 'POWERUP', 'half', 'load-shop-001')),
    ]),
  );
  for (const { c } of teams)
    assert.equal((await services.ledger.getBalance(c.team_id)).balance, 520);
  console.log(
    'All ' + count + ' balances are exactly 520. Running concurrent submissions and chess moves…',
  );
  await Promise.all(
    teams.map(({ d }) => timed(() => services.debug.start(d, 'Q-003', 'load-start-001'))),
  );
  await Promise.all(
    teams.map(({ d }) => timed(() => services.debug.submit(d, 'Q-003', 0, 'load-answer-001'))),
  );
  await Promise.all(teams.map(({ c }) => timed(() => services.chess.join(c, 'load-queue-001'))));
  const matches = await db.query("SELECT * FROM chess_matches WHERE status='ACTIVE'");
  const actors = new Map(teams.map(({ c }) => [c.team_id, c]));
  await Promise.all(
    matches.map((m) =>
      timed(() =>
        services.chess.move(actors.get(m.white_team), m.id, {
          from: 'e2',
          to: 'e4',
          expectedPly: 0,
          operationId: 'load-white-e4',
        }),
      ),
    ),
  );
  await Promise.all(
    matches.map((m) =>
      timed(() =>
        services.chess.move(actors.get(m.black_team), m.id, {
          from: 'd7',
          to: 'd5',
          expectedPly: 1,
          operationId: 'load-black-d5',
        }),
      ),
    ),
  );
  await Promise.all(
    matches.map((m) =>
      timed(() =>
        services.chess.move(actors.get(m.white_team), m.id, {
          from: 'e4',
          to: 'd5',
          expectedPly: 2,
          operationId: 'load-capture',
        }),
      ),
    ),
  );
  await services.leaderboard.snapshot();
  worker.start();
  console.log(
    'Draining ' + matches.length * 3 + ' real Stockfish analyses with two persistent workers…',
  );
  const deadline = Date.now() + 180000;
  let pending = 1;
  while (pending && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    pending = (
      await db.query(
        "SELECT count(*)::int AS n FROM chess_move_evaluations WHERE status IN('PENDING_ANALYSIS','PROCESSING')",
      )
    )[0].n;
  }
  assert.equal(pending, 0, 'Stockfish queue did not drain');
  const mismatches = await db.query(
    'SELECT t.id FROM teams t LEFT JOIN point_transactions p ON p.team_id=t.id GROUP BY t.id HAVING t.balance<>COALESCE(sum(p.amount),0)',
  );
  assert.equal(mismatches.length, 0);
  const duplicates = await db.query(
    'SELECT operation_id FROM point_transactions GROUP BY operation_id HAVING count(*)>1',
  );
  assert.equal(duplicates.length, 0);
  await rt.deliver();
  assert.equal(rt.io.engine.clientsCount, count * 2);
  timings.sort((a, b) => a - b);
  const report = {
    date: new Date().toISOString(),
    database: 'isolated embedded PostgreSQL (PGlite)',
    teams: count,
    websocketConnections: count * 2,
    httpLogins: count * 2,
    httpTeamReads: count * 2,
    simultaneousChessGames: matches.length,
    realEngineAnalyses: matches.length * 3,
    engineWorkers: 2,
    operations: timings.length,
    p50Ms: Math.round(timings[Math.floor(timings.length * 0.5)]),
    p95Ms: Math.round(timings[Math.floor(timings.length * 0.95)]),
    maxMs: Math.round(timings.at(-1)!),
    scoreMessages,
    deterministicBalance520: true,
    ledgerMismatches: mismatches.length,
    duplicateTransactions: duplicates.length,
    note: 'Local functional stress test. Hosted PostgreSQL/network capacity must be benchmarked on the deployment target.',
  };
  await mkdir('docs/validation', { recursive: true });
  await writeFile('docs/validation/load-test.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await worker.stop();
  for (const s of sockets) s.disconnect();
  await rt.stop();
  await db.close();
}
