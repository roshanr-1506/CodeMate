import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import {
  StockfishEngine,
  classifyMove,
  calculateEvaluationLoss,
  uciScore,
} from '../backend/src/services/engine.js';
test('all move-quality boundaries, both player perspectives and mate score conversion', () => {
  for (const [loss, expected] of [
    [0, 'Excellent'],
    [10, 'Excellent'],
    [11, 'Good'],
    [30, 'Good'],
    [31, 'Accurate'],
    [60, 'Accurate'],
    [61, 'Inaccuracy'],
    [100, 'Inaccuracy'],
    [101, 'Mistake'],
    [200, 'Mistake'],
    [201, 'Blunder'],
  ] as const)
    assert.equal(classifyMove(loss), expected);
  assert.equal(calculateEvaluationLoss(100, -80), 20);
  assert.equal(calculateEvaluationLoss(-100, 150), 50);
  assert.equal(calculateEvaluationLoss(0, -30), 0);
  assert.ok(uciScore('mate', 2) > 90000);
  assert.ok(uciScore('mate', -2) < -90000);
});
test('real persistent Stockfish evaluates moves without external APIs', async () => {
  const engine = new StockfishEngine();
  try {
    const game = new Chess(),
      before = game.fen();
    game.move('e4');
    const r = await engine.evaluateMove(before, game.fen(), 8, 120);
    assert.ok(Number.isFinite(r.before));
    assert.ok(Number.isFinite(r.after));
    assert.ok(r.loss >= 0);
    assert.ok(engine.ready);
    const second = await engine.analyzePosition(game.fen(), 8, 120);
    assert.ok(Number.isFinite(second));
  } finally {
    engine.stop();
  }
});
