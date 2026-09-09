import { test } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { DebuggingService } from '../backend/src/services/debugging.js';
import { AdminService, csv } from '../backend/src/services/admin.js';
import { seed } from '../scripts/seed.js';
test('admin RBAC, pause/resume preserves time, reasoned role reassignment and immutable score lock', async () => {
  const db = new Database('', true);
  let now = Date.now();
  try {
    await db.migrate();
    await seed(db, 'test-password');
    await db.query(
      "INSERT INTO admin_users(id,username,password_hash) VALUES('admin','operator',$1)",
      [await bcrypt.hash('admin-test-password', 4)],
    );
    const core = new Core(db, () => now),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests', 3600),
      ledger = new PointLedgerService(core),
      debug = new DebuggingService(core, ledger),
      admin = new AdminService(core, ledger, debug);
    const a = (await auth.login('operator', 'admin-test-password', 'ADMIN')).session,
      d = (await auth.login('TEAM-001', 'test-password', 'DEBUGGING')).session;
    await assert.rejects(admin.list(d, 'teams'), /role/);
    const started = await debug.start(d, 'Q-001', 'admin-start-q');
    now += 10000;
    await admin.control(a, 'PAUSE', 'Testing pause behavior');
    now += 60000;
    await assert.rejects(debug.submit(d, 'Q-001', 1, 'pause-submit'), /Paused/);
    await admin.control(a, 'RESUME', 'Testing resume behavior');
    assert.equal((await debug.current(d))!.remainingMs, 110000);
    await admin.forceLogout(a, d.id, 'Correcting participant assignment', 'CHESS');
    await assert.rejects(auth.session('invalid'), /expired/);
    const login = await auth.login('TEAM-001', 'test-password', 'CHESS', d.device_id);
    assert.equal(login.session.role, 'CHESS');
    await admin.adjust(a, {
      teamId: 'TEAM-001',
      amount: 20,
      reason: 'Test scoring correction',
      operationId: 'adjust-score-001',
    });
    await admin.adjust(a, {
      teamId: 'TEAM-001',
      amount: 20,
      reason: 'Test scoring correction',
      operationId: 'adjust-score-001',
    });
    assert.equal((await ledger.getBalance('TEAM-001')).balance, 20);
    await admin.control(a, 'END', 'Test competition complete');
    await assert.rejects(
      admin.adjust(a, {
        teamId: 'TEAM-001',
        amount: 10,
        reason: 'Late scoring correction',
        operationId: 'adjust-score-002',
      }),
      /locked/,
    );
    assert.ok(!JSON.stringify(await admin.export(a, 'teams')).includes('password_hash'));
    assert.ok(csv([{ name: '=HYPERLINK("evil")' }]).includes("'=HYPERLINK"));
  } finally {
    await db.close();
  }
});
