import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { PointLedgerService } from './services/ledger.js';
import { Core, need } from './services/core.js';
export function registerRoutes(app: Express, core: Core) {
  const ledger = new PointLedgerService(core);
  app.get('/api/team', async (_req, res) => {
    need(res.locals.actor.team_id, 'Team role required.', 403);
    res.json(await ledger.team(res.locals.actor));
  });
  app.get('/api/team/score', async (_req, res) =>
    res.json(await ledger.getBalance(res.locals.actor.team_id)),
  );
  app.get('/api/team/activity', async (_req, res) =>
    res.json(await ledger.getTransactions(res.locals.actor.team_id)),
  );
  app.get('/api/notifications', async (_req, res) =>
    res.json(
      await core.db.query(
        'SELECT id,message,created_at FROM notifications WHERE team_id=$1 ORDER BY created_at DESC LIMIT 50',
        [res.locals.actor.team_id],
      ),
    ),
  );
  app.get('/api/settings', async (_req, res) => res.json(await core.settings()));
  const debug = new DebuggingService(core, ledger);
  app.get('/api/debug/questions', async (_req, res) =>
    res.json(await debug.list(res.locals.actor)),
  );
  app.get('/api/debug/current', async (_req, res) =>
    res.json(await debug.current(res.locals.actor)),
  );
  app.get('/api/debug/questions/:id', async (req, res) => {
    const a = await debug.current(res.locals.actor);
    need(a && a.questionId === req.params.id, 'Start this question first.', 409);
    res.json(a);
  });
  app.post('/api/debug/questions/:id/start', async (req, res) =>
    res.json(await debug.start(res.locals.actor, String(req.params.id), req.body.operationId)),
  );
  app.post('/api/debug/questions/:id/submit', async (req, res) =>
    res.json(
      await debug.submit(
        res.locals.actor,
        String(req.params.id),
        req.body.answer,
        req.body.operationId,
      ),
    ),
  );
  app.get('/api/debug/history', async (_req, res) =>
    res.json(await debug.history(res.locals.actor)),
  );
  const shop = new ShopService(core, ledger, debug);
  app.get('/api/shop', async (_req, res) => res.json(await shop.catalog(res.locals.actor)));
  app.get(['/api/powerups', '/api/team/powerups'], async (_req, res) =>
    res.json((await shop.catalog(res.locals.actor)).powerups),
  );
  app.get('/api/premium/questions', async (_req, res) =>
    res.json((await shop.catalog(res.locals.actor)).questions),
  );
  app.get('/api/premium/sets', async (_req, res) =>
    res.json((await shop.catalog(res.locals.actor)).sets),
  );
  app.post('/api/shop/purchase', async (req, res) =>
    res.json(
      await shop.purchase(res.locals.actor, req.body.kind, req.body.itemId, req.body.operationId),
    ),
  );
  app.post('/api/premium/questions/:id/unlock', async (req, res) =>
    res.json(
      await shop.purchase(
        res.locals.actor,
        'QUESTION',
        String(req.params.id),
        req.body.operationId,
      ),
    ),
  );
  app.post('/api/premium/sets/:id/purchase', async (req, res) =>
    res.json(
      await shop.purchase(res.locals.actor, 'SET', String(req.params.id), req.body.operationId),
    ),
  );
  app.post('/api/powerups/:id/use', async (req, res) =>
    res.json(
      await shop.use(
        res.locals.actor,
        String(req.params.id),
        req.body.attemptId,
        req.body.operationId,
      ),
    ),
  );
  const chess = new ChessService(core, ledger);
  app.get('/api/chess/matches', async (_req, res) => res.json(await chess.list(res.locals.actor)));
  app.get('/api/chess/matches/:id', async (req, res) =>
    res.json(await chess.get(res.locals.actor, String(req.params.id))),
  );
  app.get('/api/chess/matches/:id/moves', async (req, res) =>
    res.json((await chess.get(res.locals.actor, String(req.params.id))).moves),
  );
  app.post('/api/chess/matchmaking/join', async (req, res) =>
    res.json(await chess.join(res.locals.actor, req.body.operationId)),
  );
  app.post('/api/chess/matchmaking/cancel', async (_req, res) =>
    res.json(await chess.cancel(res.locals.actor)),
  );
  app.post('/api/chess/matches/:id/move', async (req, res) =>
    res.json(await chess.move(res.locals.actor, String(req.params.id), req.body)),
  );
  app.post('/api/chess/matches/:id/resign', async (req, res) =>
    res.json(await chess.resign(res.locals.actor, String(req.params.id), req.body.operationId)),
  );
  app.get('/api/chess/matchmaking', async (_req, res) =>
    res.json({
      waiting:
        (
          await core.db.query('SELECT 1 FROM matchmaking_queue WHERE team_id=$1', [
            res.locals.actor.team_id,
          ])
        ).length > 0,
    }),
  );
  const leaderboard = new LeaderboardService(core);
  app.get('/api/leaderboard', async (_req, res) =>
    res.json(await leaderboard.get(res.locals.actor)),
  );
  const admin = adminRoutes(app, core, ledger, debug);
  app.post('/api/anticheat/violation', async (req, res) => {
    const a = res.locals.actor;
    need(a.team_id, 'Team role required.', 403);
    const type = String(req.body.type ?? '');
    need(['TAB_SWITCH', 'FULLSCREEN_EXIT'].includes(type), 'Invalid violation type.');
    await core.db.query(
      'INSERT INTO anticheat_violations(id,team_id,session_id,violation_type,metadata) VALUES($1,$2,$3,$4,$5)',
      [randomUUID(), a.team_id, a.id, type, JSON.stringify(req.body.metadata ?? {})],
    );
    await core.audit(core.db, a, 'ANTICHEAT_VIOLATION', a.team_id, { type, metadata: req.body.metadata });
    res.json({ ok: true });
  });
  app.get('/api/team/statistics', async (_req, res) =>
    res.json(await statistics(core, res.locals.actor)),
  );
  return { ledger, debug, shop, chess, leaderboard, admin };
}
import { DebuggingService } from './services/debugging.js';

import { ShopService } from './services/shop.js';

import { ChessService } from './services/chess.js';

import { LeaderboardService } from './services/leaderboard.js';
import { adminRoutes } from './admin-routes.js';
import { statistics } from './services/statistics.js';
