import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { AnalysisWorker } from '../backend/src/workers/analysis.js';
import { seed } from '../scripts/seed.js';
import { defaults } from '../backend/src/defaults.js';
test('real Stockfish: queen capture + excellent are separate +90/+8 events, and forced mate concession is -5', async () => {
  const db = new Database('', true);
  let worker: AnalysisWorker | undefined;
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      ledger = new PointLedgerService(core),
      chess = new ChessService(core, ledger);
    const a = (await auth.login('TEAM-001', 'test-password', 'CHESS')).session,
      b = (await auth.login('TEAM-002', 'test-password', 'CHESS')).session;
    const id = randomUUID(),
      fen = '7k/5Qq1/5K2/8/8/8/8/8 w - - 0 1';
    await db.query(
      'INSERT INTO chess_matches(id,white_team,black_team,initial_fen,fen,scoring_snapshot) VALUES($1,$2,$3,$4,$4,$5)',
      [
        id,
        a.team_id,
        b.team_id,
        fen,
        JSON.stringify({ ...defaults.scoring, enableFarmingGuard: false }),
      ],
    );
    const result = await chess.move(a, id, {
      from: 'f7',
      to: 'g7',
      expectedPly: 0,
      operationId: 'quality-queen-capture',
    });
    worker = new AnalysisWorker(core, ledger, chess, { workers: 1 });
    await worker.runOne();
    const tx = await db.query('SELECT * FROM point_transactions WHERE reference_id=$1', [
      result.move.id,
    ]);
    assert.equal(tx.find((t) => t.type === 'CHESS_CAPTURE').amount, 90);
    assert.equal(tx.find((t) => t.type === 'CHESS_MOVE_QUALITY').amount, 8);
    assert.equal(
      (
        await db.query('SELECT classification FROM chess_move_evaluations WHERE move_id=$1', [
          result.move.id,
        ])
      )[0].classification,
      'Excellent',
    );
    await chess.join(a, 'quality-join-a');
    const m = await chess.get(a, (await chess.join(b, 'quality-join-b')).matchId),
      w = m.white_team === a.team_id ? a : b,
      black = w === a ? b : a;
    await chess.move(w, m.id, { from: 'f2', to: 'f3', expectedPly: 0, operationId: 'quality-f3' });
    await chess.move(black, m.id, {
      from: 'e7',
      to: 'e5',
      expectedPly: 1,
      operationId: 'quality-e5',
    });
    const blunder = await chess.move(w, m.id, {
      from: 'g2',
      to: 'g4',
      expectedPly: 2,
      operationId: 'quality-g4',
    });
    for (let i = 0; i < 3; i++) await worker.runOne();
    const evaluation = (
      await db.query('SELECT * FROM chess_move_evaluations WHERE move_id=$1', [blunder.move.id])
    )[0];
    assert.equal(evaluation.classification, 'Blunder');
    assert.equal(evaluation.points, -5);
  } finally {
    await worker?.stop();
    await db.close();
  }
});
test('threefold repetition is reconstructed from stored moves and awards both draw bonuses', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      ledger = new PointLedgerService(core),
      chess = new ChessService(core, ledger);
    const a = (await auth.login('TEAM-001', 'test-password', 'CHESS')).session,
      b = (await auth.login('TEAM-002', 'test-password', 'CHESS')).session;
    await chess.join(a, 'draw-join-a');
    const m = await chess.get(a, (await chess.join(b, 'draw-join-b')).matchId),
      w = m.white_team === a.team_id ? a : b,
      black = w === a ? b : a;
    for (let i = 0; i < 8; i++) {
      const [from, to] = [
        ['g1', 'f3'],
        ['g8', 'f6'],
        ['f3', 'g1'],
        ['f6', 'g8'],
      ][i % 4];
      await chess.move(i % 2 ? black : w, m.id, {
        from,
        to,
        expectedPly: i,
        operationId: 'draw-move-' + i,
      });
    }
    assert.equal((await chess.get(a, m.id)).termination, 'REPETITION');
    assert.equal((await ledger.getBalance(a.team_id)).balance, 50);
    assert.equal((await ledger.getBalance(b.team_id)).balance, 50);
  } finally {
    await db.close();
  }
});
