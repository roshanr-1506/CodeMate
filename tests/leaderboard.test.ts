import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { LeaderboardService } from '../backend/src/services/leaderboard.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { defaults } from '../backend/src/defaults.js';
test('debugging receives genuinely delayed snapshots without a live fallback', async () => {
  const db = new Database('', true);
  let now = Date.now();
  try {
    await db.migrate();
    await db.query('INSERT INTO competition_settings(id,value) VALUES(1,$1)', [
      JSON.stringify({ ...defaults, state: 'RUNNING' }),
    ]);
    await db.query("INSERT INTO teams(id,name,password_hash) VALUES('T','Team','unused')");
    const core = new Core(db, () => now),
      lb = new LeaderboardService(core),
      ledger = new PointLedgerService(core);
    assert.equal((await lb.get({ role: 'DEBUGGING' })).warming, true);
    await lb.snapshot();
    await db.tx((q) =>
      ledger.change(q, {
        teamId: 'T',
        source: 'CHESS',
        type: 'BONUS',
        amount: 100,
        referenceId: 'test',
        operationId: 'lb-test-award',
        description: 'Award',
      }),
    );
    assert.equal((await lb.get({ role: 'CHESS' })).rows[0].total, 100);
    assert.equal((await lb.get({ role: 'DEBUGGING' })).rows.length, 0);
    now += 76000;
    assert.equal((await lb.get({ role: 'DEBUGGING' })).rows[0].total, 0);
    assert.equal((await lb.get({ role: 'ADMIN' })).rows[0].total, 100);
  } finally {
    await db.close();
  }
});
