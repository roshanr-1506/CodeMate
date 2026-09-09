import { StockfishEngine, classifyMove } from '../services/engine.js';
import { Core } from '../services/core.js';
import { PointLedgerService } from '../services/ledger.js';
import { ChessService } from '../services/chess.js';
export class AnalysisWorker {
  public lastError: string | null = null;
  private engines: StockfishEngine[];
  private busy: Set<number> = new Set();
  private timer?: ReturnType<typeof setInterval>;
  private stopped = false;
  constructor(
    public core: Core,
    public ledger: PointLedgerService,
    public chess: ChessService,
    opts: { workers?: number; path?: string; queueSize?: number } = {},
  ) {
    this.engines = Array.from({ length: opts.workers ?? 2 }, () => new StockfishEngine(opts.path));
  }
  get status() {
    return {
      ready: this.engines.filter((e) => e.ready).length,
      workers: this.engines.length,
      busy: this.busy.size,
    };
  }
  start() {
    this.stopped = false;
    this.timer = setInterval(() => {
      for (let i = 0; i < this.engines.length; i++) if (!this.busy.has(i)) void this.runOne(i);
    }, 300);
  }
  async runOne(index = 0) {
    if (this.busy.has(index) || this.stopped) return;
    this.busy.add(index);
    let job: any;
    try {
      job = await this.core.db.tx(async (q) => {
        const s = await this.core.settings(q);
        if (s.state !== 'RUNNING') return null;
        const [row] = await q.query(
          "SELECT v.*,m.fen_before,m.fen_after,m.team_id,m.ply,m.match_id,c.scoring_snapshot,c.score_void FROM chess_move_evaluations v JOIN chess_moves m ON m.id=v.move_id JOIN chess_matches c ON c.id=m.match_id WHERE (v.status='PENDING_ANALYSIS' AND v.next_retry_at<=$1) OR (v.status='PROCESSING' AND v.lease_until<$1) ORDER BY m.created_at LIMIT 1 FOR UPDATE OF v",
          [new Date(this.core.now())],
        );
        if (!row) return null;
        await q.query(
          "UPDATE chess_move_evaluations SET status='PROCESSING',lease_until=$2,attempts=attempts+1 WHERE move_id=$1",
          [row.move_id, new Date(this.core.now() + 60000)],
        );
        return row;
      });
      if (!job) return;
      const r = await this.engines[index].evaluateMove(
        job.fen_before,
        job.fen_after,
        job.scoring_snapshot.engineDepth,
        job.scoring_snapshot.engineTimeMs,
      );
      await this.core.db.tx(async (q) => {
        const s = await this.core.settings(q);
        const [current] = await q.query(
          'SELECT e.status AS analysis_status,m.* FROM chess_move_evaluations e JOIN chess_moves mv ON mv.id=e.move_id JOIN chess_matches m ON m.id=mv.match_id WHERE e.move_id=$1',
          [job.move_id],
        );
        if (current.analysis_status === 'COMPLETE' || current.analysis_status === 'VOID') return;
        if (s.state !== 'RUNNING') {
          await q.query(
            "UPDATE chess_move_evaluations SET status='PENDING_ANALYSIS',lease_until=NULL WHERE move_id=$1",
            [job.move_id],
          );
          return;
        }
        this.lastError = null;
        const rules = job.scoring_snapshot;
        const classification = classifyMove(r.loss, rules.thresholds);
        let points = rules.quality[classification];
        points = Math.max(-rules.maxPenalty, Math.min(rules.maxBonus, points));
        if (rules.enableFarmingGuard && job.ply <= rules.farmingGuardFirstNPlies && points > 0)
          points = 0;
        if (current.score_void) points = 0;
        await q.query(
          'UPDATE chess_move_evaluations SET status=$2,evaluation_before=$3,evaluation_after=$4,evaluation_loss=$5,classification=$6,points=$7,completed_at=$8,lease_until=NULL,last_error=NULL WHERE move_id=$1',
          [
            job.move_id,
            current.score_void ? 'VOID' : 'COMPLETE',
            r.before,
            r.after,
            r.loss,
            classification,
            points,
            new Date(this.core.now()),
          ],
        );
        if (!current.score_void)
          await this.ledger.awardPoints(q, {
            teamId: job.team_id,
            type: 'CHESS_MOVE_QUALITY',
            source: 'CHESS',
            amount: points,
            referenceId: job.move_id,
            operationId: 'quality:' + job.move_id,
            description: classification + ' move ' + (points > 0 ? '+' : '') + points,
            metadata: { farmingSuppressed: points === 0 },
          });
        await this.core.audit(
          q,
          { team_id: job.team_id, role: 'CHESS' },
          'MOVE_EVALUATION',
          job.move_id,
          { classification, points },
        );
        await this.chess.emit(q, current, 'chess:move_evaluated', {
          matchId: job.match_id,
          moveId: job.move_id,
          classification,
          points,
        });
      });
    } catch (e: any) {
      this.lastError = e.message;
      console.warn('Analysis deferred:', e.message);
      this.engines[index].stop();
      if (job)
        await this.core.db.tx(async (q) => {
          await q.query(
            "UPDATE chess_move_evaluations SET status='PENDING_ANALYSIS',lease_until=NULL,last_error=$2,next_retry_at=$3 WHERE move_id=$1 AND status='PROCESSING'",
            [
              job.move_id,
              'Engine unavailable',
              new Date(this.core.now() + Math.min(60000, 1000 * 2 ** Math.min(job.attempts, 6))),
            ],
          );
          if (job.attempts === 0)
            await this.core.notify(
              q,
              job.team_id,
              'Chess analysis temporarily unavailable — scoring will sync once available.',
            );
        });
    } finally {
      this.busy.delete(index);
    }
  }
  async stop() {
    this.stopped = true;
    clearInterval(this.timer);
    for (const engine of this.engines) engine.stop();
    while (this.busy.size) await new Promise((r) => setTimeout(r, 25));
  }
}
