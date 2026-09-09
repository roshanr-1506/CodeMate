import type { Express } from 'express';
import { AdminService, csv } from './services/admin.js';
import type { Core } from './services/core.js';
import type { PointLedgerService } from './services/ledger.js';
import type { DebuggingService } from './services/debugging.js';
export function adminRoutes(
  app: Express,
  core: Core,
  ledger: PointLedgerService,
  debug: DebuggingService,
) {
  const admin = new AdminService(core, ledger, debug);
  app.get('/api/admin/monitoring', async (_req, res) =>
    res.json({
      ...(await admin.monitoring(res.locals.actor)),
      health: await app.locals.serviceHealth?.(),
    }),
  );
  app.get('/api/admin/shop', async (_req, res) =>
    res.json({
      powerups: await admin.list(res.locals.actor, 'powerups'),
      sets: await admin.list(res.locals.actor, 'question-sets'),
      settings: await admin.list(res.locals.actor, 'settings'),
    }),
  );
  app.get('/api/admin/export/:dataset', async (req, res) => {
    const dataset = String(req.params.dataset),
      rows = await admin.export(res.locals.actor, dataset);
    if (req.query.format === 'csv') {
      res.attachment('codemate-' + dataset + '.csv');
      res.type('text/csv').send(csv(rows));
    } else {
      res.attachment('codemate-' + dataset + '.json');
      res.json(rows);
    }
  });
  app.post('/api/admin/control', async (req, res) =>
    res.json(await admin.control(res.locals.actor, req.body.action, req.body.reason)),
  );
  app.post('/api/admin/adjust', async (req, res) =>
    res.json(await admin.adjust(res.locals.actor, req.body)),
  );
  app.post('/api/admin/sessions/:id/revoke', async (req, res) =>
    res.json(
      await admin.forceLogout(
        res.locals.actor,
        String(req.params.id),
        req.body.reason,
        req.body.newRole,
      ),
    ),
  );
  app.post('/api/admin/analysis/retry', async (req, res) =>
    res.json(await admin.retry(res.locals.actor, req.body.reason)),
  );
  app.put('/api/admin/settings', async (req, res) =>
    res.json(
      await admin.updateSettings(res.locals.actor, 'settings', req.body.value, req.body.reason),
    ),
  );
  app.put('/api/admin/scoring', async (req, res) =>
    res.json(
      await admin.updateSettings(res.locals.actor, 'scoring', req.body.value, req.body.reason),
    ),
  );
  app.get('/api/admin/:resource', async (req, res) =>
    res.json(await admin.list(res.locals.actor, String(req.params.resource))),
  );
  app.post('/api/admin/:resource', async (req, res) =>
    res.json(
      await admin.save(
        res.locals.actor,
        String(req.params.resource),
        req.body.value,
        req.body.reason,
      ),
    ),
  );
  app.put('/api/admin/:resource/:id', async (req, res) =>
    res.json(
      await admin.save(
        res.locals.actor,
        String(req.params.resource),
        { ...req.body.value, id: String(req.params.id) },
        req.body.reason,
      ),
    ),
  );
  app.delete('/api/admin/:resource/:id', async (req, res) =>
    res.json(
      await admin.remove(
        res.locals.actor,
        String(req.params.resource),
        String(req.params.id),
        req.body.reason,
      ),
    ),
  );
  return admin;
}
