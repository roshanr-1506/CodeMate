import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { io as client, type Socket } from 'socket.io-client';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { createApp } from '../backend/src/app.js';
import { registerRoutes } from '../backend/src/routes.js';
import { realtime } from '../backend/src/realtime.js';
import { seed } from '../scripts/seed.js';
const once = (s: Socket, name: string) =>
  new Promise<any>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Missing ' + name)), 5000);
    s.once(name, (v) => {
      clearTimeout(t);
      resolve(v);
    });
  });
test('actual WebSocket clients synchronize team points, isolate opponents and honor revoked sessions', async () => {
  const db = new Database('', true);
  await db.migrate();
  await seed(db, 'test-password');
  const runtime = createApp(db, {
      secret: 'test-secret-long-enough-for-tests',
      origin: 'http://localhost:5173',
    }),
    services = registerRoutes(runtime.app, runtime.core);
  runtime.errors();
  const server = createServer(runtime.app),
    rt = realtime(server, runtime.core, runtime.auth, services.chess, 'http://localhost:5173');
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + (server.address() as any).port;
  const sockets: Socket[] = [];
  try {
    const a = await runtime.auth.login('TEAM-001', 'test-password', 'CHESS'),
      b = await runtime.auth.login('TEAM-001', 'test-password', 'DEBUGGING'),
      c = await runtime.auth.login('TEAM-002', 'test-password', 'CHESS');
    for (const login of [a, b, c]) {
      const socket = client(url, {
        autoConnect: false,
        transports: ['websocket'],
        extraHeaders: { Origin: 'http://localhost:5173', Cookie: 'cm_session=' + login.token },
      });
      sockets.push(socket);
      const connected = once(socket, 'connect');
      socket.connect();
      await connected;
    }
    await rt.deliver();
    let leaked = false;
    sockets[2].on('team:score_updated', () => (leaked = true));
    const one = once(sockets[0], 'team:score_updated'),
      two = once(sockets[1], 'team:score_updated');
    await db.tx((q) =>
      services.ledger.change(q, {
        teamId: 'TEAM-001',
        type: 'CHESS_CAPTURE',
        source: 'CHESS',
        amount: 10,
        referenceId: 'socket-test',
        operationId: 'socket-test-award',
        description: 'Pawn captured! +10',
      }),
    );
    await rt.deliver();
    assert.equal((await one).balance, 10);
    assert.equal((await two).balance, 10);
    assert.equal(leaked, false);
    const revoked = once(sockets[0], 'session:revoked');
    await runtime.auth.logout(a.session);
    await rt.deliver();
    await revoked;
    await assert.rejects(runtime.auth.session(a.token), /expired/);
    assert.equal((await services.ledger.getBalance('TEAM-001')).balance, 10);
  } finally {
    for (const s of sockets) s.disconnect();
    await rt.stop();
    await db.close();
  }
});
