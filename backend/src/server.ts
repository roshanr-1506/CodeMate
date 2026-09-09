import { createServer } from 'node:http';
import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from './config.js';
import { Database } from './db.js';
import { createApp } from './app.js';
import { registerRoutes } from './routes.js';
import { realtime } from './realtime.js';
import { AnalysisWorker } from './workers/analysis.js';
const db = new Database();
await db.query('SELECT 1 FROM competition_settings LIMIT 1');
const runtime = createApp(db, {
  secret: config.SESSION_SECRET,
  origin: config.FRONTEND_URL,
  production: config.NODE_ENV === 'production',
  cookieSameSite: config.COOKIE_SAME_SITE,
  idleSeconds: config.SESSION_IDLE_SECONDS,
  ttlHours: config.SESSION_TTL_HOURS,
});
const services = registerRoutes(runtime.app, runtime.core);
const server = createServer(runtime.app);
const sockets = realtime(server, runtime.core, runtime.auth, services.chess, config.FRONTEND_URL);
const worker = new AnalysisWorker(runtime.core, services.ledger, services.chess, {
  workers: config.ENGINE_WORKERS,
  path: config.STOCKFISH_PATH,
  queueSize: config.ENGINE_QUEUE_SIZE,
});
worker.start();
runtime.app.locals.serviceHealth = async () => {
  const [{ pending }] = await db.query(
    "SELECT count(*)::int AS pending FROM chess_move_evaluations WHERE status IN('PENDING_ANALYSIS','PROCESSING')",
  );
  return {
    server: 'ok',
    database: 'ok',
    socket: 'ok',
    connectedParticipants: sockets.io.engine.clientsCount,
    engine: worker.lastError
      ? 'unavailable / retrying'
      : worker.status.ready > 0
        ? 'ok'
        : worker.status.busy > 0
          ? 'starting'
          : 'idle / awaiting analysis',
    engineWorkers: worker.status.workers,
    queuePending: pending,
    queueCapacity: config.ENGINE_QUEUE_SIZE,
    queueStatus: pending > config.ENGINE_QUEUE_SIZE ? 'saturated / durably pending' : 'ok',
  };
};
if (existsSync(resolve('dist/frontend/index.html'))) {
  runtime.app.use(
    express.static(resolve('dist/frontend'), {
      index: false,
      maxAge: config.NODE_ENV === 'production' ? '1h' : 0,
    }),
  );
  runtime.app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(resolve('dist/frontend/index.html'));
  });
}
runtime.errors();
let maintenanceBusy = false;
const maintenance = setInterval(async () => {
  if (maintenanceBusy) return;
  maintenanceBusy = true;
  try {
    await db.tx(async (q) => {
      await runtime.auth.cleanup(q);
      await services.debug.expire(q);
      const s = await runtime.core.settings(q);
      if (s.state === 'RUNNING' && s.endsAt && Date.parse(s.endsAt) <= Date.now()) {
        const [{ count }] = await q.query(
          "SELECT count(*)::int AS count FROM chess_move_evaluations WHERE status IN('PENDING_ANALYSIS','PROCESSING')",
        );
        if (!count) await services.admin.finalize(q, null, 'Scheduled round end');
      }
    });
    await services.leaderboard.snapshot();
  } catch (e) {
    console.error('Maintenance deferred:', e);
  } finally {
    maintenanceBusy = false;
  }
}, 5000);
await services.leaderboard.snapshot();
server.listen(config.PORT, '0.0.0.0', () =>
  console.log('CodeMate 2.0 running at http://127.0.0.1:' + config.PORT),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(maintenance);
  await worker.stop();
  while (maintenanceBusy) await new Promise((r) => setTimeout(r, 20));
  await sockets.stop();
  await db.close();
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
