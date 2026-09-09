import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { DebuggingService } from '../backend/src/services/debugging.js';
import { seed } from '../scripts/seed.js';
test('private answers, correct and incorrect submissions, one attempt, server timer ignores client clock', async () => {
  const db = new Database('', true);
  let now = Date.now();
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db, () => now),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests', 3600),
      ledger = new PointLedgerService(core),
      debug = new DebuggingService(core, ledger);
    const a = (await auth.login('TEAM-001', 'test-password', 'DEBUGGING')).session;
    const started = await debug.start(a, 'Q-001', 'start-001');
    assert.equal(started.question.correct_answer, undefined);
    assert.equal(started.question.hint, undefined);
    assert.equal(started.question.explanation, undefined);
    const correct = await debug.submit(a, 'Q-001', 1, 'submit-001');
    assert.equal(correct.status, 'CORRECT');
    assert.equal((await ledger.getBalance(a.team_id)).balance, 30);
    await debug.submit(a, 'Q-001', 1, 'submit-001');
    assert.equal((await ledger.getTransactions(a.team_id)).length, 1);
    await assert.rejects(debug.submit(a, 'Q-001', 1, 'submit-again'), /already been submitted/);
    await debug.start(a, 'Q-002', 'start-002');
    assert.equal((await debug.submit(a, 'Q-002', 0, 'wrong-002')).status, 'INCORRECT');
    await debug.start(a, 'Q-003', 'start-003');
    now += 121000;
    assert.equal((await debug.submit(a, 'Q-003', 0, 'late-003')).status, 'EXPIRED');
    assert.equal((await ledger.getBalance(a.team_id)).balance, 30);
    await assert.rejects(debug.start(a, 'SET-1-Q-01', 'locked-001'), /Unlock/);
  } finally {
    await db.close();
  }
});
