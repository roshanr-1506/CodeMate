import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { defaults } from '../backend/src/defaults.js';
test('authentication, concurrent session cap, role lock, expiration and reconnect', async () => {
  const db = new Database('', true);
  let now = Date.now();
  try {
    await db.migrate();
    await db.query('INSERT INTO competition_settings VALUES(1,$1,now())', [
      JSON.stringify(defaults),
    ]);
    await db.query('INSERT INTO teams(id,name,password_hash) VALUES($1,$2,$3)', [
      'TEAM-001',
      'Demo',
      await bcrypt.hash('correct-password', 4),
    ]);
    const auth = new AuthService(new Core(db, () => now), 'test-secret-long-enough-for-tests', 120);
    await assert.rejects(auth.login('TEAM-001', 'wrong', 'CHESS'), /Invalid credentials/);
    const chess = await auth.login('TEAM-001', 'correct-password', 'CHESS');
    const debug = await auth.login('TEAM-001', 'correct-password', 'DEBUGGING');
    assert.equal((await auth.session(chess.token)).id, chess.session.id);
    await assert.rejects(
      auth.login('TEAM-001', 'correct-password', 'CHESS'),
      /Maximum active participants/,
    );
    await auth.logout(chess.session);
    await assert.rejects(
      auth.login('TEAM-001', 'correct-password', 'DEBUGGING', chess.device),
      /already active/,
    );
    await auth.logout(debug.session);
    await assert.rejects(
      auth.login('TEAM-001', 'correct-password', 'DEBUGGING', chess.device),
      /role is locked/,
    );
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => auth.login('TEAM-001', 'correct-password', 'CHESS')),
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    now += 121000;
    await assert.rejects(
      auth.session((results.find((r) => r.status === 'fulfilled') as any).value.token),
      /session has expired/,
    );
    assert.equal((await auth.login('TEAM-001', 'correct-password', 'CHESS')).session.role, 'CHESS');
  } finally {
    await db.close();
  }
});
