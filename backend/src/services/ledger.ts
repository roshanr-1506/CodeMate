import { randomUUID } from 'node:crypto';
import type { Query } from '../db.js';
import { Core, need, type Actor } from './core.js';
export type Change = {
  teamId: string;
  type: string;
  source: 'CHESS' | 'DEBUGGING' | 'ECONOMY' | 'ADMIN';
  amount: number;
  referenceId: string;
  operationId: string;
  description: string;
  metadata?: any;
  spend?: boolean;
};
export class PointLedgerService {
  constructor(public core: Core) {}
  async change(q: Query, c: Change) {
    need(Number.isSafeInteger(c.amount) && Math.abs(c.amount) <= 1000000, 'Invalid point amount.');
    const [duplicate] = await q.query('SELECT * FROM point_transactions WHERE operation_id=$1', [
      c.operationId,
    ]);
    if (duplicate) {
      need(
        duplicate.team_id === c.teamId &&
          duplicate.amount === c.amount &&
          duplicate.type === c.type &&
          duplicate.reference_id === c.referenceId,
        'Conflicting point event.',
        409,
      );
      return duplicate;
    }
    const [team] = await q.query('SELECT * FROM teams WHERE id=$1 FOR UPDATE', [c.teamId]);
    need(team, 'Team not found.', 404);
    if (c.spend)
      need(
        c.amount <= 0 && team.balance + c.amount >= 0,
        "You don't have enough points to purchase this item.",
        409,
      );
    const [transaction] = await q.query(
      'INSERT INTO point_transactions(id,team_id,type,source,amount,balance_before,balance_after,reference_id,operation_id,description,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
      [
        randomUUID(),
        c.teamId,
        c.type,
        c.source,
        c.amount,
        team.balance,
        team.balance + c.amount,
        c.referenceId,
        c.operationId,
        c.description,
        JSON.stringify(c.metadata ?? {}),
      ],
    );
    const column =
      c.source === 'CHESS'
        ? 'chess_earned'
        : c.source === 'DEBUGGING'
          ? 'debugging_earned'
          : c.source === 'ECONOMY'
            ? 'spent'
            : 'other_earned';
    await q.query(
      'UPDATE teams SET balance=balance+$2,' + column + '=' + column + '+$3 WHERE id=$1',
      [c.teamId, c.amount, c.source === 'ECONOMY' ? -c.amount : c.amount],
    );
    const score = await this.getBalance(c.teamId, q);
    await this.core.event(q, 'team:' + c.teamId, 'team:score_updated', score);
    await this.core.event(q, 'team:' + c.teamId, 'team:balance_updated', score);
    await this.core.notify(q, c.teamId, c.description);
    return transaction;
  }
  awardPoints(q: Query, c: Change) {
    return this.change(q, c);
  }
  spendPoints(q: Query, c: Change) {
    return this.change(q, { ...c, source: 'ECONOMY', spend: true });
  }
  refundPoints(q: Query, c: Change) {
    return this.change(q, { ...c, source: 'ECONOMY' });
  }
  adjustPoints(q: Query, c: Change) {
    return this.change(q, { ...c, source: 'ADMIN' });
  }
  async getBalance(teamId: string, q: Query = this.core.db) {
    const [t] = await q.query(
      'SELECT id,name,balance,chess_earned,debugging_earned,other_earned,spent,chess_earned+debugging_earned+other_earned AS total_earned FROM teams WHERE id=$1',
      [teamId],
    );
    need(t, 'Team not found.', 404);
    return t;
  }
  getTransactions(teamId: string, limit = 100) {
    return this.core.db.query(
      'SELECT * FROM point_transactions WHERE team_id=$1 ORDER BY sequence DESC LIMIT $2',
      [teamId, limit],
    );
  }
  async team(a: Actor) {
    const score = await this.getBalance(a.team_id);
    const sessions = await this.core.db.query(
      "SELECT id,role,last_heartbeat,expires_at FROM team_sessions WHERE team_id=$1 AND status='ACTIVE'",
      [a.team_id],
    );
    return { ...score, sessions, settings: await this.core.settings() };
  }
}
