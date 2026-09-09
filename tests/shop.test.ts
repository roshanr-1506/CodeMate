import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { DebuggingService } from '../backend/src/services/debugging.js';
import { ShopService } from '../backend/src/services/shop.js';
import { seed } from '../scripts/seed.js';
test('shop ownership, atomic spending, every power-up, actual freeze and 25-question premium set', async () => {
  const db = new Database('', true);
  let now = Date.now();
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db, () => now),
      ledger = new PointLedgerService(core),
      debug = new DebuggingService(core, ledger),
      shop = new ShopService(core, ledger, debug);
    const a = (
      await new AuthService(core, 'test-secret-long-enough-for-tests', 3600).login(
        'TEAM-001',
        'test-password',
        'DEBUGGING',
      )
    ).session;
    await assert.rejects(shop.purchase(a, 'POWERUP', 'freeze', 'insuff-001'), /enough points/);
    await db.tx((q) =>
      ledger.adjustPoints(q, {
        teamId: a.team_id,
        source: 'ADMIN',
        type: 'BONUS',
        amount: 2000,
        referenceId: 'test',
        operationId: 'test-fund',
        description: 'Test funding',
      }),
    );
    await shop.purchase(a, 'POWERUP', 'freeze', 'buy-freeze');
    await shop.purchase(a, 'POWERUP', 'freeze', 'buy-freeze');
    assert.equal((await ledger.getBalance(a.team_id)).balance, 1900);
    const start = await debug.start(a, 'Q-001', 'start-q1');
    now += 10000;
    const freeze = await shop.use(a, 'freeze', start.id, 'use-freeze');
    assert.equal(freeze.remainingMs, 110000);
    now += 20000;
    assert.equal((await debug.current(a))!.remainingMs, 110000);
    await shop.use(a, 'freeze', start.id, 'use-freeze');
    assert.equal((await shop.catalog(a)).powerups.find((p) => p.id === 'freeze').owned, 0);
    for (const id of ['half', 'blast', 'extra', 'hint', 'skip']) {
      await shop.purchase(a, 'POWERUP', id, 'buy-' + id);
      const result = await shop.use(a, id, start.id, 'use-' + id);
      if (id === 'half') assert.equal(result.removedOptions.length, 2);
      if (id === 'blast') assert.equal(result.removedOptions.length, 3);
      if (id === 'hint') assert.ok(result.hint);
      if (id === 'skip') assert.equal(result.status, 'SKIPPED');
    }
    await shop.purchase(a, 'QUESTION', 'PREMIUM-1', 'buy-premium');
    assert.equal((await debug.start(a, 'PREMIUM-1', 'start-premium')).question.points, 50);
    await debug.submit(a, 'PREMIUM-1', 0, 'submit-premium');
    const p = await shop.purchase(a, 'SET', 'SET-1', 'buy-set-1');
    assert.equal(p.unlocked, 25);
    await shop.purchase(a, 'SET', 'SET-1', 'buy-set-1');
    await assert.rejects(shop.purchase(a, 'SET', 'SET-1', 'buy-set-again'), /already own/);
    const unlocked = (await debug.list(a)).filter((x) => x.set_id === 'SET-1');
    assert.equal(unlocked.length, 25);
    assert.ok(unlocked.every((x) => x.owned));
    assert.equal(new Set(unlocked.map((x) => x.language)).size, 5);
    assert.equal((await debug.start(a, unlocked[0].id, 'start-set-q')).question.points, 50);
  } finally {
    await db.close();
  }
});
