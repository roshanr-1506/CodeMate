import { randomUUID } from 'node:crypto';
import { Core, type Actor } from './core.js';
import type { Query } from '../db.js';
export class LeaderboardService {
  constructor(public core: Core) {}
  async live(q: Query = this.core.db) {
    return q.query(
      'SELECT row_number() OVER(ORDER BY chess_earned+debugging_earned+other_earned DESC,id)::int AS rank,id,name,chess_earned,debugging_earned,other_earned,chess_earned+debugging_earned+other_earned AS total FROM teams WHERE deleted=false ORDER BY rank',
    );
  }
  async get(a: Pick<Actor, 'role'>, q: Query = this.core.db) {
    const s = await this.core.settings(q),
      delay =
        a.role === 'DEBUGGING' && s.antiSniping && s.shopOpen && s.state === 'RUNNING'
          ? s.leaderboardDelaySeconds
          : 0;
    if (delay) {
      const [row] = await q.query(
        'SELECT payload,created_at FROM leaderboard_snapshots WHERE created_at<=$1 ORDER BY created_at DESC LIMIT 1',
        [new Date(this.core.now() - delay * 1000)],
      );
      return {
        rows: row?.payload ?? [],
        asOf: row?.created_at ?? null,
        delaySeconds: delay,
        warming: !row,
      };
    }
    return {
      rows: await this.live(q),
      asOf: new Date(this.core.now()).toISOString(),
      delaySeconds: 0,
      warming: false,
    };
  }
  async snapshot() {
    await this.core.db.tx(async (q) => {
      const rows = await this.live(q);
      await q.query('INSERT INTO leaderboard_snapshots(id,payload,created_at) VALUES($1,$2,$3)', [
        randomUUID(),
        JSON.stringify(rows),
        new Date(this.core.now()),
      ]);
      await q.query('DELETE FROM leaderboard_snapshots WHERE created_at<$1', [
        new Date(this.core.now() - 86400000),
      ]);
      for (const role of ['CHESS', 'DEBUGGING', 'ADMIN'] as const)
        await this.core.event(
          q,
          'leaderboard:' + role,
          'leaderboard:updated',
          await this.get({ role }, q),
        );
    });
  }
}
