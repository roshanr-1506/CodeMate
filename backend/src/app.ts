import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { parse, serialize } from 'cookie';
import { z } from 'zod';
import type { Database } from './db.js';
import { Core, AppError } from './services/core.js';
import { AuthService } from './services/auth.js';
export function createApp(
  db: Database,
  opts: {
    secret: string;
    origin: string;
    production?: boolean;
    idleSeconds?: number;
    ttlHours?: number;
    cookieSameSite?: 'lax' | 'strict' | 'none';
    now?: () => number;
  },
) {
  const app = express(),
    core = new Core(db, opts.now),
    auth = new AuthService(core, opts.secret, opts.idleSeconds, opts.ttlHours);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: opts.origin, credentials: true }));
  app.use(express.json({ limit: '128kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 500,
      skipSuccessfulRequests: true,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.use((req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== opts.origin)
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    next();
  });
  const cookieOptions = {
    httpOnly: true,
    secure: !!opts.production,
    sameSite: opts.cookieSameSite ?? ('lax' as const),
    path: '/',
  };
  app.get('/health', async (_req, res) => {
    try {
      await db.query('SELECT 1');
    } catch {
      return res
        .status(503)
        .json({
          server: 'ok',
          database: 'unavailable',
          socket: 'unknown',
          engine: 'unknown',
          timestamp: new Date(core.now()).toISOString(),
        });
    }
    res.json({
      server: 'ok',
      database: 'ok',
      ...((await app.locals.serviceHealth?.()) ?? { socket: 'not_started', engine: 'not_started' }),
      timestamp: new Date(core.now()).toISOString(),
    });
  });
  app.post(
    '/api/auth/login',
    rateLimit({ windowMs: 60000, limit: 600, standardHeaders: 'draft-8', legacyHeaders: false }),
    rateLimit({
      windowMs: 60000,
      limit: 20,
      keyGenerator: (req) =>
        ipKeyGenerator(req.ip ?? '127.0.0.1') +
        ':' +
        String(req.body?.identifier ?? '').toUpperCase(),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
    async (req, res) => {
      const body = z
        .object({
          identifier: z.string().min(1).max(80),
          password: z.string().min(1).max(128),
          role: z.enum(['CHESS', 'DEBUGGING', 'ADMIN']),
        })
        .parse(req.body);
      const r = await auth.login(
        body.identifier,
        body.password,
        body.role,
        parse(req.headers.cookie ?? '').cm_device,
      );
      res.setHeader('Set-Cookie', [
        serialize('cm_session', r.token, {
          ...cookieOptions,
          maxAge: (opts.ttlHours ?? 12) * 3600,
        }),
        serialize('cm_device', r.device, { ...cookieOptions, maxAge: 365 * 86400 }),
      ]);
      res.json({ session: r.session, csrf: r.csrf });
    },
  );
  app.use('/api', async (req, res, next) => {
    try {
      const a = await auth.session(
        parse(req.headers.cookie ?? '').cm_session,
        req.path === '/auth/heartbeat',
      );
      res.locals.actor = a;
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
        req.headers['x-csrf-token'] !== auth.csrf(a)
      )
        throw new AppError(403, 'Invalid CSRF token. Refresh and retry.');
      next();
    } catch (e) {
      next(e);
    }
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 1200,
      keyGenerator: (_req, res) => res.locals.actor.id,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );
  app.get('/api/auth/session', async (_req, res) =>
    res.json({ session: res.locals.actor, csrf: auth.csrf(res.locals.actor) }),
  );
  app.post('/api/auth/heartbeat', async (_req, res) =>
    res.json({ ok: true, serverNow: core.now() }),
  );
  app.post('/api/auth/logout', async (_req, res) => {
    await auth.logout(res.locals.actor);
    res.setHeader('Set-Cookie', serialize('cm_session', '', { ...cookieOptions, maxAge: 0 }));
    res.json({ ok: true });
  });
  return {
    app,
    core,
    auth,
    errors: () => {
      app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
      app.use((error: any, _req: any, res: any, _next: any) => {
        if (error instanceof z.ZodError)
          return res.status(400).json({
            error: 'Invalid input.',
            details: error.issues.map((i) => ({ path: i.path, message: i.message })),
          });
        if (!(error instanceof AppError))
          console.error('Request failed:', error.code ?? error.name);
        res.status(error instanceof AppError ? error.status : 500).json({
          error: error instanceof AppError ? error.message : 'Something went wrong. Please retry.',
        });
      });
    },
  };
}
