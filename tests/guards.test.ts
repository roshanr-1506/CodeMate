import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { seed } from '../scripts/seed.js';
test('early resignation reverses both teams game points and voids late engine analysis', async () => {
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
    await chess.join(a, 'guard-join-a');
    const m = await chess.get(a, (await chess.join(b, 'guard-join-b')).matchId),
      w = m.white_team === a.team_id ? a : b,
      black = w === a ? b : a;
    await chess.move(w, m.id, {
      from: 'e2',
      to: 'e4',
      expectedPly: 0,
      operationId: 'guard-move-1',
    });
    await chess.move(black, m.id, {
      from: 'd7',
      to: 'd5',
      expectedPly: 1,
      operationId: 'guard-move-2',
    });
    await chess.move(w, m.id, {
      from: 'e4',
      to: 'd5',
      expectedPly: 2,
      operationId: 'guard-move-3',
    });
    assert.equal((await ledger.getBalance(w.team_id)).balance, 10);
    await chess.resign(black, m.id, 'guard-resign');
    await chess.resign(black, m.id, 'guard-resign');
    assert.equal((await ledger.getBalance(w.team_id)).balance, 0);
    assert.equal((await ledger.getBalance(black.team_id)).balance, 0);
    assert.ok((await chess.get(w, m.id)).score_void);
    assert.ok(
      (await db.query('SELECT * FROM chess_move_evaluations')).every((r) => r.status === 'VOID'),
    );
    assert.equal(
      (await db.query("SELECT * FROM point_transactions WHERE type='CHESS_EARLY_REVERSAL'")).length,
      2,
    );
  } finally {
    await db.close();
  }
});
