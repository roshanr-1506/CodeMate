import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { DebuggingService } from '../backend/src/services/debugging.js';
import { ShopService } from '../backend/src/services/shop.js';
import { seed } from '../scripts/seed.js';
test('concurrent overspend rejected, operation payload binding, cumulative freeze cap and final-window restriction', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      ledger = new PointLedgerService(core),
      debug = new DebuggingService(core, ledger),
      shop = new ShopService(core, ledger, debug);
    const a = (await auth.login('TEAM-001', 'test-password', 'DEBUGGING')).session;
    const fund = (amount: number, id: string) =>
      db.tx((q) =>
        ledger.adjustPoints(q, {
          teamId: a.team_id,
          source: 'ADMIN',
          type: 'BONUS',
          amount,
          referenceId: 'security-fixture',
          operationId: id,
          description: 'Test fixture funding',
        }),
      );
    await fund(100, 'overspend-fund');
    const results = await Promise.allSettled([
      shop.purchase(a, 'POWERUP', 'half', 'concurrent-buy-1'),
      shop.purchase(a, 'POWERUP', 'half', 'concurrent-buy-2'),
    ]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    assert.equal((await ledger.getBalance(a.team_id)).balance, 20);
    const op = results[0].status === 'fulfilled' ? 'concurrent-buy-1' : 'concurrent-buy-2';
    await assert.rejects(shop.purchase(a, 'POWERUP', 'blast', op), /different request/);
    await fund(1000, 'freeze-cap-fund');
    for (let i = 0; i < 3; i++) await shop.purchase(a, 'POWERUP', 'freeze', 'buy-freeze-' + i);
    for (let i = 1; i <= 2; i++) {
      const q = await debug.start(a, 'Q-00' + i, 'start-freeze-q' + i);
      await shop.use(a, 'freeze', q.id, 'use-freeze-q' + i);
      await debug.submit(a, 'Q-00' + i, i === 1 ? 1 : 3, 'finish-freeze-q' + i);
    }
    const q3 = await debug.start(a, 'Q-003', 'start-freeze-q3');
    await assert.rejects(
      shop.use(a, 'freeze', q3.id, 'use-freeze-q3'),
      /round’s Freeze Time limit/,
    );
    const s = await core.settings();
    s.endsAt = new Date(Date.now() + 60000).toISOString();
    await db.query('UPDATE competition_settings SET value=$1', [JSON.stringify(s)]);
    await assert.rejects(shop.purchase(a, 'POWERUP', 'freeze', 'last-minute-buy'), /final part/);
  } finally {
    await db.close();
  }
});
