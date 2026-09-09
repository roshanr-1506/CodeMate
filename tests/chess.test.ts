import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { seed } from '../scripts/seed.js';
test('internal matchmaking, role and turn checks, legal moves, captures and replay idempotency', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      chess = new ChessService(core, new PointLedgerService(core));
    const a = (await auth.login('TEAM-001', 'test-password', 'CHESS')).session,
      b = (await auth.login('TEAM-002', 'test-password', 'CHESS')).session,
      d = (await auth.login('TEAM-001', 'test-password', 'DEBUGGING')).session;
    await assert.rejects(chess.join(d, 'join-debug'), /role/);
    assert.equal((await chess.join(a, 'join-team1')).status, 'WAITING');
    const match = await chess.join(b, 'join-team2');
    assert.equal(match.status, 'MATCHED');
    const m = await chess.get(a, match.matchId),
      w = m.white_team === a.team_id ? a : b,
      black = w === a ? b : a;
    await assert.rejects(
      chess.move(black, m.id, { from: 'e7', to: 'e5', expectedPly: 0, operationId: 'wrong-turn' }),
      /Wait for/,
    );
    await assert.rejects(
      chess.move(w, m.id, { from: 'e2', to: 'e5', expectedPly: 0, operationId: 'illegal-001' }),
      /not legal/,
    );
    const input = { from: 'e2', to: 'e4', expectedPly: 0, operationId: 'white-first' };
    await chess.move(w, m.id, input);
    await chess.move(w, m.id, input);
    assert.equal((await chess.get(w, m.id)).ply, 1);
    await chess.move(black, m.id, {
      from: 'd7',
      to: 'd5',
      expectedPly: 1,
      operationId: 'black-first',
    });
    const capture = await chess.move(w, m.id, {
      from: 'e4',
      to: 'd5',
      expectedPly: 2,
      operationId: 'white-capture',
    });
    assert.equal(capture.move.captured_piece, 'p');
    assert.equal((await chess.get(a, m.id)).moves.length, 3);
  } finally {
    await db.close();
  }
});
