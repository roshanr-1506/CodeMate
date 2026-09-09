import { AuthService } from '../backend/src/services/auth.js';
import { Core } from '../backend/src/services/core.js';
import { PointLedgerService } from '../backend/src/services/ledger.js';
import { ChessService } from '../backend/src/services/chess.js';
import { AnalysisWorker } from '../backend/src/workers/analysis.js';
import type { Database } from '../backend/src/db.js';
export async function demoMatch(db: Database, password: string, secret: string) {
  if ((await db.query('SELECT 1 FROM chess_matches LIMIT 1')).length) return;
  const core = new Core(db),
    auth = new AuthService(core, secret),
    ledger = new PointLedgerService(core),
    chess = new ChessService(core, ledger);
  const a = (await auth.login('TEAM-009', password, 'CHESS')).session,
    b = (await auth.login('TEAM-010', password, 'CHESS')).session;
  try {
    await chess.join(a, 'demo-join-009');
    const m = await chess.get(a, (await chess.join(b, 'demo-join-010')).matchId),
      w = m.white_team === a.team_id ? a : b,
      black = w === a ? b : a;
    for (const [ply, from, to] of [
      [0, 'f2', 'f3'],
      [1, 'e7', 'e5'],
      [2, 'g2', 'g4'],
      [3, 'd8', 'h4'],
    ] as const)
      await chess.move(ply % 2 ? black : w, m.id, {
        from,
        to,
        expectedPly: ply,
        operationId: 'demo-game-move-' + ply,
      });
    const worker = new AnalysisWorker(core, ledger, chess, { workers: 1 });
    try {
      for (let i = 0; i < 4; i++) await worker.runOne();
    } finally {
      await worker.stop();
    }
    await db.tx((q) =>
      core.audit(q, null, 'DEMO_MATCH_CREATED', m.id, {
        demo: true,
        description: 'Legal sample game, scored by chess.js and real Stockfish.',
      }),
    );
  } finally {
    await auth.logout(a);
    await auth.logout(b);
  }
}
