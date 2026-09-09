import { Core, type Actor } from './core.js';
export async function statistics(core: Core, a: Actor) {
  const q = core.db,
    id = a.team_id;
  const matches = await q.query(
    'SELECT status,result,white_team,black_team FROM chess_matches WHERE white_team=$1 OR black_team=$1',
    [id],
  );
  const completed = matches.filter((m) => m.status === 'COMPLETED');
  const attempts = await q.query(
    "SELECT status,question_snapshot->>'difficulty' AS difficulty FROM debugging_attempts WHERE team_id=$1",
    [id],
  );
  return {
    chess: {
      matches: matches.length,
      wins: completed.filter(
        (m) =>
          (m.result === '1-0' && m.white_team === id) ||
          (m.result === '0-1' && m.black_team === id),
      ).length,
      draws: completed.filter((m) => m.result === '1/2-1/2').length,
      losses: completed.filter(
        (m) =>
          (m.result === '1-0' && m.black_team === id) ||
          (m.result === '0-1' && m.white_team === id),
      ).length,
      captures: await q.query(
        'SELECT captured_piece AS piece,count(*)::int AS count FROM chess_moves WHERE team_id=$1 AND captured_piece IS NOT NULL GROUP BY captured_piece',
        [id],
      ),
      moveQuality: await q.query(
        'SELECT e.classification,count(*)::int AS count FROM chess_move_evaluations e JOIN chess_moves m ON m.id=e.move_id WHERE m.team_id=$1 AND e.classification IS NOT NULL GROUP BY e.classification',
        [id],
      ),
      scores: await q.query(
        "SELECT type,sum(amount)::int AS points FROM point_transactions WHERE team_id=$1 AND source='CHESS' GROUP BY type",
        [id],
      ),
    },
    debugging: {
      attempted: attempts.filter((x) => x.status !== 'ACTIVE').length,
      correct: attempts.filter((x) => x.status === 'CORRECT').length,
      incorrect: attempts.filter((x) => x.status === 'INCORRECT').length,
      expired: attempts.filter((x) => x.status === 'EXPIRED').length,
      skipped: attempts.filter((x) => x.status === 'SKIPPED').length,
      byDifficulty: await q.query(
        "SELECT question_snapshot->>'difficulty' AS difficulty,count(*)::int AS attempted,count(*) FILTER(WHERE status='CORRECT')::int AS correct FROM debugging_attempts WHERE team_id=$1 AND status<>'ACTIVE' GROUP BY question_snapshot->>'difficulty'",
        [id],
      ),
    },
    economy: {
      inventory: await q.query(
        'SELECT p.name,t.quantity FROM team_powerups t JOIN powerups p ON p.id=t.powerup_id WHERE t.team_id=$1 AND t.quantity>0',
        [id],
      ),
      premiumQuestions: (
        await q.query('SELECT count(*)::int AS n FROM team_question_unlocks WHERE team_id=$1', [id])
      )[0].n,
      premiumSets: (
        await q.query('SELECT count(*)::int AS n FROM team_set_unlocks WHERE team_id=$1', [id])
      )[0].n,
    },
  };
}
