import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { AnalysisWorker } from '../backend/src/workers/analysis.js';
import { seed } from '../scripts/seed.js';
test('engine failures stay pending; real queue recovery scores exactly once with opening guard', async () => {
  const db = new Database('', true);
  let now = Date.now();
  let worker: AnalysisWorker | undefined;
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db, () => now),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      ledger = new PointLedgerService(core),
      chess = new ChessService(core, ledger);
    const a = (await auth.login('TEAM-001', 'test-password', 'CHESS')).session,
      b = (await auth.login('TEAM-002', 'test-password', 'CHESS')).session;
    await chess.join(a, 'join-team-1');
    const m = await chess.get(a, (await chess.join(b, 'join-team-2')).matchId);
    const w = m.white_team === a.team_id ? a : b;
    const move = await chess.move(w, m.id, {
      from: 'e2',
      to: 'e4',
      expectedPly: 0,
      operationId: 'engine-move-1',
    });
    worker = new AnalysisWorker(core, ledger, chess, {
      workers: 1,
      path: 'codemate-nonexistent-engine',
    });
    await worker.runOne();
    let row = (
      await db.query('SELECT * FROM chess_move_evaluations WHERE move_id=$1', [move.move.id])
    )[0];
    assert.equal(row.status, 'PENDING_ANALYSIS');
    assert.equal((await ledger.getBalance(w.team_id)).balance, 0);
    await worker.stop();
    now += 2000;
    worker = new AnalysisWorker(core, ledger, chess, { workers: 1 });
    await worker.runOne();
    row = (
      await db.query('SELECT * FROM chess_move_evaluations WHERE move_id=$1', [move.move.id])
    )[0];
    assert.equal(row.status, 'COMPLETE');
    assert.ok(row.classification);
    if (row.points > 0) assert.fail('Opening bonus must be suppressed');
    await worker.runOne();
    assert.equal(
      (await db.query("SELECT * FROM point_transactions WHERE type='CHESS_MOVE_QUALITY'")).length,
      1,
    );
    assert.ok(!JSON.stringify(await chess.get(w, m.id)).includes('evaluation_before'));
  } finally {
    await worker?.stop();
    await db.close();
  }
});
