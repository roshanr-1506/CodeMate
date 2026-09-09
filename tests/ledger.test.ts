import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
test('immutable ledger serializes 500 + 100 - 80 to 520; retries cannot duplicate awards', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await db.query("INSERT INTO teams(id,name,password_hash) VALUES('T','Team','unused')");
    const ledger = new PointLedgerService(new Core(db));
    const base = {
      teamId: 'T',
      type: 'BONUS',
      source: 'CHESS' as const,
      referenceId: 'test',
      description: 'Test award',
    };
    await db.tx((q) => ledger.change(q, { ...base, amount: 500, operationId: 'opening' }));
    await Promise.all([
      db.tx((q) => ledger.change(q, { ...base, amount: 100, operationId: 'chess' })),
      db.tx((q) =>
        ledger.spendPoints(q, { ...base, type: 'SHOP_PURCHASE', amount: -80, operationId: 'shop' }),
      ),
    ]);
    assert.equal((await ledger.getBalance('T')).balance, 520);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.tx((q) => ledger.change(q, { ...base, amount: 100, operationId: 'chess' })),
      ),
    );
    assert.equal((await ledger.getBalance('T')).balance, 520);
    await assert.rejects(
      db.tx((q) =>
        ledger.spendPoints(q, {
          ...base,
          type: 'SHOP_PURCHASE',
          amount: -1000,
          operationId: 'expensive',
        }),
      ),
      /enough points/,
    );
    assert.equal((await ledger.getTransactions('T')).length, 3);
    await assert.rejects(db.query('UPDATE point_transactions SET amount=1'), /Immutable record/);
  } finally {
    await db.close();
  }
});
