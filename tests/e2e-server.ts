import { createServer } from 'node:http';
import express from 'express';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { Database } from '../backend/src/db.js';
import { createApp } from '../backend/src/app.js';
import { registerRoutes } from '../backend/src/routes.js';
import { realtime } from '../backend/src/realtime.js';
import { AnalysisWorker } from '../backend/src/workers/analysis.js';
import { seed } from '../scripts/seed.js';
const db = new Database('', true);
await db.migrate();
await seed(db, 'browser-test-password');
await db.query(
  "INSERT INTO admin_users(id,username,password_hash) VALUES('browser-admin','browser-admin',$1)",
  [await bcrypt.hash('browser-admin-password', 4)],
);
const runtime = createApp(db, {
    secret: 'browser-test-only-secret-long-enough',
    origin: 'http://127.0.0.1:3101',
    idleSeconds: 900,
  }),
  services = registerRoutes(runtime.app, runtime.core);
await db.tx((q) =>
  services.ledger.adjustPoints(q, {
    teamId: 'TEAM-001',
    type: 'BONUS',
    source: 'ADMIN',
    amount: 2000,
    referenceId: 'browser-fixture',
    operationId: 'browser-fixture-bonus',
    description: 'Isolated browser-test starting balance',
  }),
);
runtime.app.use(express.static(resolve('dist/frontend')));
runtime.app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/frontend/index.html')));
runtime.errors();
const server = createServer(runtime.app),
  rt = realtime(server, runtime.core, runtime.auth, services.chess, 'http://127.0.0.1:3101'),
  worker = new AnalysisWorker(runtime.core, services.ledger, services.chess, { workers: 2 });
runtime.app.locals.serviceHealth = async () => ({
  database: 'ok',
  socket: 'ok',
  engine: worker.status.ready ? 'ok' : 'idle',
});
worker.start();
const timer = setInterval(() => services.leaderboard.snapshot().catch(console.error), 5000);
server.listen(3101, '127.0.0.1', () => console.log('Isolated browser test server ready'));
const stop = async () => {
  clearInterval(timer);
  await worker.stop();
  await rt.stop();
  await db.close();
  process.exit(0);
};
process.on('message', (m) => {
  if (m === 'stop') void stop();
});
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
