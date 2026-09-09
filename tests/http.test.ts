import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Database } from '../backend/src/db.js';
import { createApp } from '../backend/src/app.js';
import { registerRoutes } from '../backend/src/routes.js';
import { seed } from '../scripts/seed.js';
test('running HTTP API: health, cookie login, CSRF, RBAC, private question payload and submission', async () => {
  const db = new Database('', true);
  await db.migrate();
  await seed(db, 'http-test-password');
  const runtime = createApp(db, {
    secret: 'a-long-test-secret-with-enough-bytes',
    origin: 'http://localhost:5173',
  });
  registerRoutes(runtime.app, runtime.core);
  runtime.errors();
  const server = createServer(runtime.app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = 'http://127.0.0.1:' + (server.address() as any).port;
  try {
    assert.equal((await fetch(url + '/health')).status, 200);
    assert.equal((await fetch(url + '/api/team')).status, 401);
    let r = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:5173' },
      body: JSON.stringify({
        identifier: 'TEAM-001',
        password: 'http-test-password',
        role: 'DEBUGGING',
      }),
    });
    assert.equal(r.status, 200);
    const cookie = r.headers
      .getSetCookie()
      .map((v) => v.split(';')[0])
      .join('; ');
    const body = await r.json();
    assert.ok(cookie.includes('cm_session='));
    assert.ok(r.headers.getSetCookie()[0].includes('HttpOnly'));
    const headers = {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      Cookie: cookie,
      'X-CSRF-Token': body.csrf,
    };
    r = await fetch(url + '/api/debug/questions/Q-001/start', {
      method: 'POST',
      headers,
      body: JSON.stringify({ operationId: 'http-start-001' }),
    });
    assert.equal(r.status, 200);
    const q = await r.json();
    assert.equal(q.question.correct_answer, undefined);
    r = await fetch(url + '/api/debug/questions/Q-001/submit', {
      method: 'POST',
      headers: { ...headers, 'X-CSRF-Token': 'bad' },
      body: JSON.stringify({ operationId: 'http-submit-01', answer: 1 }),
    });
    assert.equal(r.status, 403);
    r = await fetch(url + '/api/debug/questions/Q-001/submit', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        operationId: 'http-submit-01',
        answer: 1,
        points: 999999,
        remaining: 999999,
      }),
    });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).status, 'CORRECT');
    assert.equal((await (await fetch(url + '/api/team/score', { headers })).json()).balance, 30);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  }
});
