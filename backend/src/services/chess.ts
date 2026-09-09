import { Chess, DEFAULT_POSITION } from 'chess.js';
import { randomUUID, randomInt } from 'node:crypto';
import { Core, need, type Actor } from './core.js';
import { PointLedgerService } from './ledger.js';
import type { Query } from '../db.js';
export class ChessService {
  constructor(
    public core: Core,
    public ledger: PointLedgerService,
  ) {}
  async emit(q: Query, m: any, event: string, payload: any) {
    for (const id of [m.white_team, m.black_team])
      await this.core.event(q, 'chess-team:' + id, event, payload);
  }
  async list(a: Actor) {
    return this.core.db.query(
      'SELECT id,white_team,black_team,fen,ply,status,result,termination,score_void,time_control,white_time_ms,black_time_ms,created_at,completed_at FROM chess_matches WHERE white_team=$1 OR black_team=$1 ORDER BY created_at DESC LIMIT 100',
      [a.team_id],
    );
  }
  async get(a: Actor, id: string) {
    const [m] = await this.core.db.query('SELECT * FROM chess_matches WHERE id=$1', [id]);
    need(
      m && (m.white_team === a.team_id || m.black_team === a.team_id || a.role === 'ADMIN'),
      'Match not found.',
      404,
    );
    const { scoring_snapshot, ...match } = m;
    const detailsAllowed=a.role==='ADMIN'||(m.status==='COMPLETED'&&(await this.core.settings()).detailedAnalysis);
    const moves = await this.core.db.query(
      'SELECT m.*,e.status AS analysis_status,e.classification,e.points'+(detailsAllowed?',e.evaluation_before,e.evaluation_after,e.evaluation_loss':'')+' FROM chess_moves m LEFT JOIN chess_move_evaluations e ON e.move_id=m.id WHERE m.match_id=$1 ORDER BY ply',
      [id],
    );
    const scores = await this.core.db.query(
      "SELECT team_id,type,sum(amount)::int AS points FROM point_transactions WHERE source='CHESS' AND (reference_id=$1 OR reference_id IN(SELECT id FROM chess_moves WHERE match_id=$1)) GROUP BY team_id,type",
      [id],
    );
    return {
      ...match,
      moves,
      scores,
      color: m.white_team === a.team_id ? 'w' : 'b',
      serverNow: this.core.now(),
    };
  }
  async join(a: Actor, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'CHESS');
      return this.core.operation(q, a, op, ['matchmaking'], async () => {
        const s = await this.core.active(q);
        const [current] = await q.query('SELECT match_id FROM chess_players WHERE team_id=$1', [
          a.team_id,
        ]);
        if (current) return { matchId: current.match_id, status: 'MATCHED' };
        const candidates = await q.query(
          "SELECT mq.team_id FROM matchmaking_queue mq JOIN teams t ON t.id=mq.team_id WHERE mq.team_id<>$1 AND t.enabled AND EXISTS(SELECT 1 FROM team_sessions ts WHERE ts.team_id=mq.team_id AND ts.role='CHESS' AND ts.status='ACTIVE' AND ts.expires_at>$2) ORDER BY mq.created_at",
          [a.team_id, new Date(this.core.now())],
        );
        let opponent: string | undefined;
        for (const c of candidates) {
          if (
            s.allowRematch ||
            !(
              await q.query(
                'SELECT 1 FROM chess_matches WHERE (white_team=$1 AND black_team=$2) OR (white_team=$2 AND black_team=$1)',
                [a.team_id, c.team_id],
              )
            ).length
          ) {
            opponent = c.team_id;
            break;
          }
        }
        if (!opponent) {
          await q.query(
            'INSERT INTO matchmaking_queue(team_id) VALUES($1) ON CONFLICT DO NOTHING',
            [a.team_id],
          );
          return { status: 'WAITING' };
        }
        const id = randomUUID(),
          white = randomInt(2) ? a.team_id : opponent,
          black = white === a.team_id ? opponent : a.team_id;
        const timed = s.chessTimeControl === 'TIMED';
        const baseMs = timed ? s.chessBaseTimeSeconds * 1000 : null;
        const now = new Date(this.core.now());
        const [m] = await q.query(
          'INSERT INTO chess_matches(id,white_team,black_team,initial_fen,fen,scoring_snapshot,time_control,white_time_ms,black_time_ms,last_move_at) VALUES($1,$2,$3,$4,$4,$5,$6,$7,$7,$8) RETURNING *',
          [id, white, black, DEFAULT_POSITION, JSON.stringify(s.scoring), timed ? 'TIMED' : 'UNTIMED', baseMs, now],
        );
        await q.query(
          "INSERT INTO chess_players(team_id,match_id,color) VALUES($1,$3,'w'),($2,$3,'b')",
          [white, black, id],
        );
        await q.query('DELETE FROM matchmaking_queue WHERE team_id IN($1,$2)', [white, black]);
        await this.core.audit(q, a, 'CHESS_MATCH_CREATED', id, { white, black, timeControl: m.time_control });
        await this.emit(q, m, 'chess:match_found', { matchId: id, status: 'MATCHED', timeControl: m.time_control, whiteTimeMs: m.white_time_ms, blackTimeMs: m.black_time_ms });
        return { matchId: id, status: 'MATCHED' };
      });
    });
  }
  async cancel(a: Actor) {
    await this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'CHESS');
      await q.query('DELETE FROM matchmaking_queue WHERE team_id=$1', [a.team_id]);
    });
    return { ok: true };
  }
  /** Check if the position has insufficient material for the given side to deliver checkmate */
  private hasInsufficientMaterial(fen: string, side: 'w' | 'b'): boolean {
    const game = new Chess(fen);
    const board = game.board();
    const pieces: string[] = [];
    for (const row of board)
      for (const sq of row)
        if (sq && sq.color === side) pieces.push(sq.type);
    // King only
    if (pieces.length === 1) return true;
    // King + bishop or King + knight
    if (pieces.length === 2 && (pieces.includes('b') || pieces.includes('n'))) return true;
    return false;
  }
  async finish(q: Query, m: any, result: string, termination: string, a: Actor) {
    const rules = m.scoring_snapshot;
    const draw = result === '1/2-1/2';
    const winner = result === '1-0' ? m.white_team : m.black_team;
    for (const teamId of [m.white_team, m.black_team]) {
      const outcome = draw ? 'draw' : teamId === winner ? 'win' : 'loss';
      const points = rules.result[outcome];
      await this.ledger.awardPoints(q, {
        teamId,
        source: 'CHESS',
        type: 'CHESS_RESULT',
        amount: points,
        referenceId: m.id,
        operationId: 'result:' + m.id + ':' + teamId,
        description: outcome[0].toUpperCase() + outcome.slice(1) + ' bonus +' + points,
      });
    }
    if (termination === 'CHECKMATE')
      await this.ledger.awardPoints(q, {
        teamId: winner,
        source: 'CHESS',
        type: 'CHESS_CHECKMATE',
        amount: rules.capture.k,
        referenceId: m.id,
        operationId: 'checkmate:' + m.id,
        description: 'Checkmate Bonus +' + rules.capture.k,
      });
    // Strategic resign bonus: award points to resigning team if resignation is strategic (not early)
    if (
      termination === 'RESIGNATION' &&
      rules.strategicResignPoints > 0 &&
      (!rules.earlyResignationGuard || m.ply >= rules.earlyResignationPly)
    ) {
      const loser = result === '1-0' ? m.black_team : m.white_team;
      await this.ledger.awardPoints(q, {
        teamId: loser,
        source: 'CHESS',
        type: 'CHESS_STRATEGIC_RESIGN',
        amount: rules.strategicResignPoints,
        referenceId: m.id,
        operationId: 'strategic-resign:' + m.id,
        description: 'Strategic resignation bonus +' + rules.strategicResignPoints,
      });
    }
    if (
      termination === 'RESIGNATION' &&
      rules.earlyResignationGuard &&
      m.ply < rules.earlyResignationPly
    ) {
      const scores = await q.query(
        "SELECT team_id,sum(amount)::int AS amount FROM point_transactions WHERE source='CHESS' AND (reference_id=$1 OR reference_id IN(SELECT id FROM chess_moves WHERE match_id=$1)) GROUP BY team_id",
        [m.id],
      );
      for (const score of scores)
        await this.ledger.change(q, {
          teamId: score.team_id,
          source: 'CHESS',
          type: 'CHESS_EARLY_REVERSAL',
          amount: -score.amount,
          referenceId: m.id,
          operationId: 'early-reversal:' + m.id + ':' + score.team_id,
          description: 'Early resignation: game points reversed',
          metadata: { ply: m.ply, threshold: rules.earlyResignationPly },
        });
      await q.query('UPDATE chess_matches SET score_void=true WHERE id=$1', [m.id]);
      await q.query(
        "UPDATE chess_move_evaluations SET status='VOID',points=0,lease_until=NULL WHERE move_id IN(SELECT id FROM chess_moves WHERE match_id=$1) AND status<>'COMPLETE'",
        [m.id],
      );
      await this.core.audit(q, a, 'EARLY_RESIGNATION_GUARD', m.id, { ply: m.ply });
    }
    await q.query(
      "UPDATE chess_matches SET status='COMPLETED',result=$2,termination=$3,completed_at=$4 WHERE id=$1",
      [m.id, result, termination, new Date(this.core.now())],
    );
    await q.query('DELETE FROM chess_players WHERE match_id=$1', [m.id]);
    await this.core.audit(q, a, 'CHESS_RESULT', m.id, { result, termination });
    await this.emit(q, m, 'chess:match_completed', { matchId: m.id, result, termination });
  }
  /** Check if a player has timed out and handle accordingly */
  async checkTimeout(q: Query, m: any, a: Actor): Promise<boolean> {
    if (m.time_control !== 'TIMED' || !m.last_move_at) return false;
    const now = this.core.now();
    const elapsed = now - new Date(m.last_move_at).getTime();
    const turn = m.fen.split(' ')[1]; // 'w' or 'b'
    const timeKey = turn === 'w' ? 'white_time_ms' : 'black_time_ms';
    const remaining = (m[timeKey] ?? 0) - elapsed;
    if (remaining > 0) return false;
    // Time expired — update the column to 0
    await q.query('UPDATE chess_matches SET ' + timeKey + '=0 WHERE id=$1', [m.id]);
    const flaggedTeam = turn === 'w' ? m.white_team : m.black_team;
    const otherTeam = turn === 'w' ? m.black_team : m.white_team;
    const otherSide = turn === 'w' ? 'b' : 'w';
    // chess.com rule: if opponent has insufficient material, it's a draw
    if (this.hasInsufficientMaterial(m.fen, otherSide)) {
      await this.finish(q, m, '1/2-1/2', 'TIMEOUT_INSUFFICIENT', a);
    } else {
      const result = flaggedTeam === m.white_team ? '0-1' : '1-0';
      await this.finish(q, m, result, 'TIMEOUT', a);
    }
    return true;
  }
  async move(
    a: Actor,
    id: string,
    input: {
      from: string;
      to: string;
      promotion?: string;
      expectedPly: number;
      operationId: string;
    },
  ) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'CHESS');
      return this.core.operation(
        q,
        a,
        input.operationId,
        ['move', id, input.from, input.to, input.promotion ?? 'q', input.expectedPly],
        async () => {
          await this.core.active(q);
          const [m] = await q.query('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [id]);
          need(
            m && (m.white_team === a.team_id || m.black_team === a.team_id),
            'Match not found.',
            404,
          );
          need(m.status === 'ACTIVE', 'This match has ended.', 409);
          // Check for timeout before processing move
          if (await this.checkTimeout(q, m, a)) {
            need(false, 'Time expired. The match has ended.', 409);
          }
          need(
            input.expectedPly === m.ply,
            'The board has changed. Your game has been refreshed.',
            409,
          );
          need(
            /^[a-h][1-8]$/.test(input.from) &&
              /^[a-h][1-8]$/.test(input.to) &&
              /^[qrbn]$/.test(input.promotion ?? 'q'),
            'Invalid move.',
          );
          const game = new Chess(m.initial_fen);
          for (const previous of await q.query(
            'SELECT uci FROM chess_moves WHERE match_id=$1 ORDER BY ply',
            [id],
          ))
            game.move({
              from: previous.uci.slice(0, 2),
              to: previous.uci.slice(2, 4),
              promotion: previous.uci[4],
            });
          const color = m.white_team === a.team_id ? 'w' : 'b';
          need(game.turn() === color, 'Wait for your opponent\'s move.', 409);
          const before = game.fen();
          let played;
          try {
            played = game.move({
              from: input.from,
              to: input.to,
              promotion: input.promotion ?? 'q',
            });
          } catch {
            need(false, 'That move is not legal.', 422);
          }
          // Update clock for timed games
          const now = this.core.now();
          let whiteTime = m.white_time_ms;
          let blackTime = m.black_time_ms;
          if (m.time_control === 'TIMED' && m.last_move_at) {
            const elapsed = now - new Date(m.last_move_at).getTime();
            const increment = (m.scoring_snapshot.chessIncrementSeconds ?? (await this.core.settings(q)).chessIncrementSeconds ?? 0) * 1000;
            if (color === 'w') {
              whiteTime = Math.max(0, (whiteTime ?? 0) - elapsed + increment);
            } else {
              blackTime = Math.max(0, (blackTime ?? 0) - elapsed + increment);
            }
          }
          const moveId = randomUUID();
          const [move] = await q.query(
            'INSERT INTO chess_moves(id,match_id,ply,team_id,player_color,from_square,to_square,san,uci,fen_before,fen_after,captured_piece,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
            [
              moveId,
              id,
              m.ply + 1,
              a.team_id,
              color,
              input.from,
              input.to,
              played.san,
              input.from + input.to + (played.promotion ?? ''),
              before,
              game.fen(),
              played.captured ?? null,
              input.operationId,
            ],
          );
          await q.query('INSERT INTO chess_move_evaluations(move_id,next_retry_at) VALUES($1,$2)', [
            moveId,
            new Date(this.core.now()),
          ]);
          await q.query('UPDATE chess_matches SET fen=$2,ply=ply+1,white_time_ms=$3,black_time_ms=$4,last_move_at=$5 WHERE id=$1', [id, game.fen(), whiteTime, blackTime, new Date(now)]);
          if (played.captured) {
            const points = m.scoring_snapshot.capture[played.captured];
            await this.ledger.awardPoints(q, {
              teamId: a.team_id,
              source: 'CHESS',
              type: 'CHESS_CAPTURE',
              amount: points,
              referenceId: moveId,
              operationId: 'capture:' + moveId,
              description:
                ({ p: 'Pawn', n: 'Knight', b: 'Bishop', r: 'Rook', q: 'Queen' } as any)[
                  played.captured
                ] +
                ' captured! +' +
                points,
            });
            await this.emit(q, m, 'chess:piece_captured', {
              matchId: id,
              piece: played.captured,
              points,
              teamId: a.team_id,
            });
          }
          await q.query(
            'INSERT INTO chess_events(id,match_id,event_id,type,payload) VALUES($1,$2,$3,$4,$5)',
            [
              randomUUID(),
              id,
              'move:' + moveId,
              'MOVE_ACCEPTED',
              JSON.stringify({ moveId, ply: move.ply }),
            ],
          );
          await this.core.audit(q, a, 'CHESS_MOVE', moveId, {
            san: played.san,
            matchId: id,
            captured: played.captured ?? null,
          });
          if (game.isGameOver())
            await this.finish(
              q,
              { ...m, ply: m.ply + 1 },
              game.isCheckmate() ? (color === 'w' ? '1-0' : '0-1') : '1/2-1/2',
              game.isCheckmate()
                ? 'CHECKMATE'
                : game.isStalemate()
                  ? 'STALEMATE'
                  : game.isThreefoldRepetition()
                    ? 'REPETITION'
                    : game.isInsufficientMaterial()
                      ? 'INSUFFICIENT_MATERIAL'
                      : 'FIFTY_MOVE',
              a,
            );
          await this.emit(q, m, 'chess:move_accepted', {
            matchId: id,
            move,
            fen: game.fen(),
            check: game.isCheck(),
            completed: game.isGameOver(),
            whiteTimeMs: whiteTime,
            blackTimeMs: blackTime,
          });
          return { matchId: id, move, fen: game.fen(), completed: game.isGameOver(), whiteTimeMs: whiteTime, blackTimeMs: blackTime };
        },
      );
    });
  }
  async resign(a: Actor, id: string, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'CHESS');
      return this.core.operation(q, a, op, ['resign', id], async () => {
        await this.core.active(q);
        const [m] = await q.query('SELECT * FROM chess_matches WHERE id=$1 FOR UPDATE', [id]);
        need(
          m && (m.white_team === a.team_id || m.black_team === a.team_id),
          'Match not found.',
          404,
        );
        need(m.status === 'ACTIVE', 'This match has ended.', 409);
        const result = m.white_team === a.team_id ? '0-1' : '1-0';
        await this.finish(q, m, result, 'RESIGNATION', a);
        return { matchId: id, result };
      });
    });
  }
}
