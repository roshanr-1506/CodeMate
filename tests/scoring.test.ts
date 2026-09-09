import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Database } from '../backend/src/db.js';
import { Core } from '../backend/src/services/core.js';
import { AuthService } from '../backend/src/services/auth.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { seed } from '../scripts/seed.js';
import { defaults } from '../backend/src/defaults.js';
test('all five capture values and verified checkmate + win/loss bonuses', async () => {
  const db = new Database('', true);
  try {
    await db.migrate();
    await seed(db, 'test-password');
    const core = new Core(db),
      auth = new AuthService(core, 'test-secret-long-enough-for-tests'),
      ledger = new PointLedgerService(core),
      chess = new ChessService(core, ledger);
    const w = (await auth.login('TEAM-001', 'test-password', 'CHESS')).session,
      b = (await auth.login('TEAM-002', 'test-password', 'CHESS')).session;
    for (const [piece, value] of Object.entries(defaults.scoring.capture).filter(
      ([p]) => p !== 'k',
    )) {
      const id = randomUUID(),
        fen = '4k3/8/8/8/8/8/' + piece + '7/R3K3 w - - 0 1';
      await db.query(
        'INSERT INTO chess_matches(id,white_team,black_team,initial_fen,fen,scoring_snapshot) VALUES($1,$2,$3,$4,$4,$5)',
        [id, w.team_id, b.team_id, fen, JSON.stringify(defaults.scoring)],
      );
      const before = (await ledger.getBalance(w.team_id)).balance;
      await chess.move(w, id, {
        from: 'a1',
        to: 'a2',
        expectedPly: 0,
        operationId: 'capture-' + piece,
      });
      assert.equal((await ledger.getBalance(w.team_id)).balance - before, value);
    }
    await chess.join(w, 'join-white');
    const joined = await chess.join(b, 'join-black');
    const m = await chess.get(w, joined.matchId),
      white = m.white_team === w.team_id ? w : b,
      black = white === w ? b : w;
    const beforeW = (await ledger.getBalance(white.team_id)).balance,
      beforeB = (await ledger.getBalance(black.team_id)).balance;
    for (const [ply, from, to] of [
      [0, 'f2', 'f3'],
      [1, 'e7', 'e5'],
      [2, 'g2', 'g4'],
      [3, 'd8', 'h4'],
    ] as const)
      await chess.move(ply % 2 ? black : white, m.id, {
        from,
        to,
        expectedPly: ply,
        operationId: 'checkmate-' + ply,
      });
    assert.equal((await chess.get(w, m.id)).termination, 'CHECKMATE');
    assert.equal((await ledger.getBalance(black.team_id)).balance - beforeB, 170);
    assert.equal((await ledger.getBalance(white.team_id)).balance - beforeW, 10);
  } finally {
    await db.close();
  }
});
