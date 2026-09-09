import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { Core, need, type Actor } from './core.js';
import { PointLedgerService } from './ledger.js';
import { DebuggingService } from './debugging.js';
import type { Query } from '../db.js';
const id = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
const text = z.string().min(1).max(10000),
  reason = z.string().min(5).max(1000);
const price = z.number().int().min(0).max(100000);
export const questionSchema = z.object({
  id,
  title: text.max(200),
  prompt: text,
  language: text.max(50),
  code_snippet: z.string().max(15000),
  options: z
    .array(z.string().min(1).max(2000))
    .length(4)
    .refine((v) => new Set(v).size === 4, 'Answer choices must be distinct.'),
  correct_answer: z.number().int().min(0).max(3),
  difficulty: z.enum(['Easy', 'Medium', 'Hard', 'Expert']),
  points: z.number().int().min(1).max(10000),
  time_limit: z.number().int().min(10).max(3600),
  category: text.max(100),
  explanation: text,
  hint: text,
  premium: z.boolean(),
  active: z.boolean(),
});
const powerSchema = z.object({
  id,
  name: text.max(100),
  description: text,
  cost: price,
  effect: z.enum(['FREEZE', 'HALF', 'BLAST', 'EXTRA', 'SKIP', 'HINT']),
  duration: z.number().int().min(1).max(300),
  usage_limit: z.number().int().min(1).max(10),
  active: z.boolean(),
});
const setSchema = z.object({
  id,
  name: text.max(200),
  description: text,
  price,
  points_per_question: z.number().int().min(1).max(1000),
  active: z.boolean(),
  question_ids: z
    .array(id)
    .length(25)
    .refine((v) => new Set(v).size === 25, 'Select 25 unique questions.'),
});
const positiveScore = z.number().int().min(0).max(10000),
  signedScore = z.number().int().min(-100).max(100);
const scoringSchema = z.object({
  capture: z.object({
    p: positiveScore,
    n: positiveScore,
    b: positiveScore,
    r: positiveScore,
    q: positiveScore,
    k: positiveScore,
  }),
  result: z.object({ win: positiveScore, draw: positiveScore, loss: positiveScore }),
  quality: z.object({
    Excellent: signedScore,
    Good: signedScore,
    Accurate: signedScore,
    Inaccuracy: signedScore,
    Mistake: signedScore,
    Blunder: signedScore,
  }),
  thresholds: z
    .array(z.number().int().min(0).max(10000))
    .length(5)
    .refine((v) => v.every((n, i) => i === 0 || n > v[i - 1]), 'Thresholds must increase.'),
  debugging: z.object({
    Easy: positiveScore,
    Medium: positiveScore,
    Hard: positiveScore,
    Expert: positiveScore,
  }),
  enableFarmingGuard: z.boolean(),
  farmingGuardFirstNPlies: z.number().int().min(0).max(100),
  earlyResignationGuard: z.boolean(),
  earlyResignationPly: z.number().int().min(0).max(100),
  engineDepth: z.number().int().min(1).max(24),
  engineTimeMs: z.number().int().min(50).max(5000),
  maxBonus: z.number().int().min(0).max(100),
  maxPenalty: z.number().int().min(0).max(100),
  strategicResignPoints: z.number().int().min(0).max(10000),
});
const settingsSchema = z.object({
  shopOpen: z.boolean(),
  freezeFinalSeconds: z.number().int().min(0).max(3600),
  freezeLimitSeconds: z.number().int().min(0).max(600),
  leaderboardDelaySeconds: z.number().int().min(0).max(600),
  antiSniping: z.boolean(),
  allowRematch: z.boolean(),
  detailedAnalysis: z.boolean(),
  individualQuestionPrice: price,
  sessionRoleSelection: z.boolean(),
  chessTimeControl: z.enum(['UNTIMED', 'TIMED']),
  chessBaseTimeSeconds: z.number().int().min(30).max(7200),
  chessIncrementSeconds: z.number().int().min(0).max(300),
  endsAt: z.iso.datetime().nullable(),
  roundId: z.number().int().min(1),
});
export class AdminService {
  constructor(
    public core: Core,
    public ledger: PointLedgerService,
    public debug: DebuggingService,
  ) {}
  async check(a: Actor, q: Query = this.core.db) {
    await this.core.authorize(q, a, 'ADMIN');
  }
  async list(a: Actor, resource: string) {
    await this.check(a);
    const queries: Record<string, string> = {
      teams:
        'SELECT id,name,enabled,deleted,balance,chess_earned,debugging_earned,other_earned,spent,created_at FROM teams ORDER BY id',
      sessions:
        'SELECT s.id,s.team_id,s.role,s.device_id,s.created_at,s.last_heartbeat,s.expires_at,s.status FROM team_sessions s ORDER BY s.created_at DESC LIMIT 500',
      questions: 'SELECT * FROM debugging_questions ORDER BY id',
      'question-sets':
        "SELECT s.*,COALESCE((SELECT jsonb_agg(question_id ORDER BY question_id) FROM question_set_questions sq WHERE sq.set_id=s.id),'[]'::jsonb) AS question_ids FROM question_sets s ORDER BY s.id",
      powerups: 'SELECT * FROM powerups ORDER BY cost,id',
      transactions: 'SELECT * FROM point_transactions ORDER BY sequence DESC LIMIT 1000',
      audit: 'SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 1000',
      purchases: 'SELECT * FROM purchases ORDER BY created_at DESC LIMIT 1000',
      matches: 'SELECT * FROM chess_matches ORDER BY created_at DESC LIMIT 500',
      violations: 'SELECT v.*, t.name AS team_name FROM anticheat_violations v JOIN teams t ON t.id=v.team_id ORDER BY v.created_at DESC LIMIT 500',
    };
    if (resource === 'settings' || resource === 'scoring') return this.core.settings();
    need(queries[resource], 'Unknown admin resource.', 404);
    return this.core.db.query(queries[resource]);
  }
  async save(a: Actor, resource: string, input: any, why: string) {
    reason.parse(why);
    let v: any;
    if (resource === 'teams') {
      v = z
        .object({
          id,
          name: text.max(100),
          enabled: z.boolean(),
          password: z.string().min(12).max(128).optional(),
        })
        .parse(input);
      if (v.password) v.password_hash = await bcrypt.hash(v.password, 12);
      delete v.password;
    } else if (resource === 'questions') v = questionSchema.parse(input);
    else if (resource === 'powerups') v = powerSchema.parse(input);
    else if (resource === 'question-sets') v = setSchema.parse(input);
    else need(false, 'Unknown resource.', 404);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      if (resource === 'teams') {
        const [existing] = await q.query('SELECT * FROM teams WHERE id=$1', [v.id]);
        if (!existing)
          need(v.password_hash, 'A password of at least 12 characters is required for a new team.');
        await q.query(
          'INSERT INTO teams(id,name,password_hash,enabled) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,enabled=EXCLUDED.enabled,password_hash=COALESCE($5,teams.password_hash)',
          [v.id, v.name, v.password_hash ?? 'unused', v.enabled, v.password_hash ?? null],
        );
        if (!v.enabled || v.password_hash) await this.revokeTeam(q, v.id, a, why);
      }
      if (resource === 'questions') {
        const fields = Object.keys(v);
        const values = fields.map((k) => (k === 'options' ? JSON.stringify(v[k]) : v[k]));
        await q.query(
          'INSERT INTO debugging_questions(' +
            fields.join(',') +
            ') VALUES(' +
            fields.map((_, i) => '$' + (i + 1)).join(',') +
            ') ON CONFLICT(id) DO UPDATE SET ' +
            fields
              .filter((k) => k !== 'id')
              .map((k) => k + '=EXCLUDED.' + k)
              .join(',') +
            ',updated_at=now()',
          values,
        );
      }
      if (resource === 'powerups') {
        const [old] = await q.query('SELECT * FROM powerups WHERE id=$1', [v.id]);
        if (old && old.effect !== v.effect)
          need(
            !(
              await q.query("SELECT 1 FROM purchases WHERE item_id=$1 AND kind='POWERUP' LIMIT 1", [
                v.id,
              ])
            ).length,
            'A purchased power-up cannot change its effect. Create a new product.',
          );
        const fields = Object.keys(v);
        await q.query(
          'INSERT INTO powerups(' +
            fields.join(',') +
            ') VALUES(' +
            fields.map((_, i) => '$' + (i + 1)).join(',') +
            ') ON CONFLICT(id) DO UPDATE SET ' +
            fields
              .filter((k) => k !== 'id')
              .map((k) => k + '=EXCLUDED.' + k)
              .join(','),
          Object.values(v),
        );
      }
      if (resource === 'question-sets') {
        const rows = await q.query('SELECT * FROM debugging_questions WHERE id=ANY($1::text[])', [
          v.question_ids,
        ]);
        need(
          rows.length === 25 &&
            rows.every((x) => x.premium && ['Hard', 'Expert'].includes(x.difficulty)) &&
            new Set(rows.map((x) => x.language)).size > 1,
          'Choose 25 premium Hard/Expert questions across multiple languages.',
        );
        const old = await q.query(
          'SELECT question_id FROM question_set_questions WHERE set_id=$1',
          [v.id],
        );
        if (
          (await q.query('SELECT 1 FROM team_set_unlocks WHERE set_id=$1 LIMIT 1', [v.id])).length
        )
          need(
            JSON.stringify(old.map((x) => x.question_id).sort()) ===
              JSON.stringify([...v.question_ids].sort()),
            'A purchased set’s membership is locked.',
          );
        need(
          !(
            await q.query(
              'SELECT 1 FROM question_set_questions WHERE question_id=ANY($1::text[]) AND set_id<>$2 LIMIT 1',
              [v.question_ids, v.id],
            )
          ).length,
          'A question already belongs to another set.',
        );
        await q.query(
          'INSERT INTO question_sets(id,name,description,price,points_per_question,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,price=EXCLUDED.price,points_per_question=EXCLUDED.points_per_question,active=EXCLUDED.active',
          [v.id, v.name, v.description, v.price, v.points_per_question, v.active],
        );
        await q.query('DELETE FROM question_set_questions WHERE set_id=$1', [v.id]);
        for (const qid of v.question_ids)
          await q.query('INSERT INTO question_set_questions(set_id,question_id) VALUES($1,$2)', [
            v.id,
            qid,
          ]);
      }
      await this.core.audit(q, a, 'ADMIN_SAVE_' + resource.toUpperCase(), v.id, { reason: why });
      await this.core.event(q, 'admin', 'admin:changed', { resource });
      return { ok: true, id: v.id };
    });
  }
  async remove(a: Actor, resource: string, itemId: string, why: string) {
    reason.parse(why);
    const tables: any = {
      teams: 'teams',
      questions: 'debugging_questions',
      'question-sets': 'question_sets',
      powerups: 'powerups',
    };
    need(tables[resource], 'Unknown resource.');
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      const rows = await q.query(
        'UPDATE ' +
          tables[resource] +
          ' SET ' +
          (resource === 'teams' ? 'enabled=false,deleted=true' : 'active=false') +
          ' WHERE id=$1 RETURNING id',
        [itemId],
      );
      need(rows.length, 'Item not found.', 404);
      if (resource === 'teams') await this.revokeTeam(q, itemId, a, why);
      await this.core.audit(q, a, 'ADMIN_ARCHIVE_' + resource.toUpperCase(), itemId, {
        reason: why,
      });
      return { ok: true };
    });
  }
  async revokeTeam(q: Query, id: string, a: Actor, why: string) {
    const rows = await q.query(
      "UPDATE team_sessions SET status='REVOKED' WHERE team_id=$1 AND status='ACTIVE' RETURNING id",
      [id],
    );
    for (const row of rows)
      await this.core.event(q, 'session:' + row.id, 'session:revoked', { reason: why });
    await q.query('DELETE FROM matchmaking_queue WHERE team_id=$1', [id]);
    await this.core.event(q, 'team:' + id, 'team:session_left', {});
  }
  async forceLogout(a: Actor, sessionId: string, why: string, newRole?: string) {
    reason.parse(why);
    if (newRole) z.enum(['CHESS', 'DEBUGGING']).parse(newRole);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      const [s] = await q.query(
        "UPDATE team_sessions SET status='REVOKED' WHERE id=$1 RETURNING *",
        [sessionId],
      );
      need(s, 'Session not found.', 404);
      if (newRole) {
        need(s.team_id, 'Only team roles can be reassigned.');
        const settings = await this.core.settings(q);
        await q.query(
          'INSERT INTO role_locks(team_id,device_id,round_id,role) VALUES($1,$2,$3,$4) ON CONFLICT(team_id,device_id,round_id) DO UPDATE SET role=EXCLUDED.role',
          [s.team_id, s.device_id, settings.roundId, newRole],
        );
      }
      await this.core.audit(q, a, newRole ? 'FORCE_ROLE_REASSIGN' : 'FORCE_LOGOUT', sessionId, {
        reason: why,
        newRole,
      });
      await this.core.event(q, 'session:' + sessionId, 'session:revoked', { reason: why });
      if (s.team_id) await this.core.event(q, 'team:' + s.team_id, 'team:session_left', {});
      return { ok: true };
    });
  }
  async adjust(a: Actor, input: any) {
    const v = z
      .object({
        teamId: id,
        amount: z.number().int().min(-100000).max(100000),
        reason,
        operationId: z.string().min(8).max(100),
      })
      .parse(input);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      const s = await this.core.settings(q);
      need(s.state !== 'ENDED', 'Scores are locked after the competition ends.', 409);
      const r = await this.ledger.adjustPoints(q, {
        teamId: v.teamId,
        source: 'ADMIN',
        type: 'ADMIN_ADJUSTMENT',
        amount: v.amount,
        referenceId: v.teamId,
        operationId: 'admin:' + a.id + ':' + v.operationId,
        description: 'Admin adjustment: ' + v.reason,
      });
      await this.core.audit(q, a, 'POINT_ADJUSTMENT', r.id, { reason: v.reason, amount: v.amount });
      return r;
    });
  }
  async updateSettings(a: Actor, kind: string, input: any, why: string) {
    reason.parse(why);
    const value = kind === 'scoring' ? scoringSchema.parse(input) : settingsSchema.parse(input);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      const old = await this.core.settings(q);
      need(
        old.state !== 'ENDED' || kind === 'settings',
        'Scoring is locked after the competition ends.',
        409,
      );
      if (kind === 'settings' && (value as any).roundId !== old.roundId)
        need(
          ['WAITING', 'ENDED'].includes(old.state),
          'Change rounds only between competitions.',
          409,
        );
      const next = kind === 'scoring' ? { ...old, scoring: value } : { ...old, ...value };
      await q.query('UPDATE competition_settings SET value=$1,updated_at=now() WHERE id=1', [
        JSON.stringify(next),
      ]);
      if (kind === 'scoring')
        for (const difficulty of ['Easy', 'Medium', 'Hard', 'Expert'])
          await q.query(
            'UPDATE debugging_questions SET points=$1 WHERE difficulty=$2 AND premium=false',
            [(value as any).debugging[difficulty], difficulty],
          );
      await this.core.audit(q, a, 'ADMIN_' + kind.toUpperCase(), null, {
        reason: why,
        before: old,
        after: next,
      });
      for (const role of ['CHESS', 'DEBUGGING', 'ADMIN'])
        await this.core.event(q, 'leaderboard:' + role, 'competition:updated', {
          state: next.state,
        });
      return next;
    });
  }
  async finalize(q: Query, a: Actor | null, why: string) {
    const pending = (
      await q.query(
        "SELECT count(*)::int AS count FROM chess_move_evaluations WHERE status IN('PENDING_ANALYSIS','PROCESSING')",
      )
    )[0].count;
    need(
      pending === 0,
      'Resolve pending chess analysis before ending the competition. Resume if paused, then retry.',
      409,
    );
    const s = await this.core.settings(q);
    if (s.state === 'ENDED') return s;
    s.state = 'ENDED';
    s.pausedAt = null;
    await q.query('UPDATE competition_settings SET value=$1 WHERE id=1', [JSON.stringify(s)]);
    await q.query(
      "UPDATE debugging_attempts SET status='EXPIRED',submitted_at=$1 WHERE status='ACTIVE'",
      [new Date(this.core.now())],
    );
    await q.query(
      "UPDATE chess_matches SET status='COMPLETED',result='*',termination='COMPETITION_END',completed_at=$1 WHERE status='ACTIVE'",
      [new Date(this.core.now())],
    );
    await q.query('DELETE FROM chess_players');
    await q.query('DELETE FROM matchmaking_queue');
    await this.core.audit(q, a, 'COMPETITION_ENDED', null, { reason: why });
    for (const role of ['CHESS', 'DEBUGGING', 'ADMIN'])
      await this.core.event(q, 'leaderboard:' + role, 'competition:updated', { state: 'ENDED' });
    return s;
  }
  async control(a: Actor, action: string, why: string) {
    reason.parse(why);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      const s = await this.core.settings(q),
        now = this.core.now();
      if (action === 'END') return this.finalize(q, a, why);
      if (action === 'START') {
        need(s.state === 'WAITING' || s.state === 'ENDED', 'Competition is already started.', 409);
        if (s.state === 'ENDED') s.roundId++;
        need(
          !s.endsAt || Date.parse(s.endsAt) > now,
          'Set a future round end time before starting.',
        );
        s.state = 'RUNNING';
      } else if (action === 'PAUSE') {
        need(s.state === 'RUNNING', 'Only a running competition can be paused.', 409);
        await this.debug.expire(q);
        s.state = 'PAUSED';
        s.pausedAt = new Date(now).toISOString();
      } else if (action === 'RESUME') {
        need(s.state === 'PAUSED' && s.pausedAt, 'Competition is not paused.', 409);
        const delta = now - Date.parse(s.pausedAt);
        await q.query(
          "UPDATE debugging_attempts SET expires_at=expires_at+($1::double precision*interval '1 millisecond'),frozen_until=CASE WHEN frozen_until>$2 THEN frozen_until+($1::double precision*interval '1 millisecond') ELSE frozen_until END WHERE status='ACTIVE'",
          [delta, s.pausedAt],
        );
        if (s.endsAt) s.endsAt = new Date(Date.parse(s.endsAt) + delta).toISOString();
        s.state = 'RUNNING';
        s.pausedAt = null;
      } else need(false, 'Unknown competition action.');
      await q.query('UPDATE competition_settings SET value=$1,updated_at=now() WHERE id=1', [
        JSON.stringify(s),
      ]);
      await this.core.audit(q, a, 'COMPETITION_' + action, null, { reason: why });
      for (const role of ['CHESS', 'DEBUGGING', 'ADMIN'])
        await this.core.event(q, 'leaderboard:' + role, 'competition:updated', { state: s.state });
      return s;
    });
  }
  async retry(a: Actor, why: string) {
    reason.parse(why);
    return this.core.db.tx(async (q) => {
      await this.check(a, q);
      await q.query(
        "UPDATE chess_move_evaluations SET next_retry_at=$1 WHERE status='PENDING_ANALYSIS'",
        [new Date(this.core.now())],
      );
      await this.core.audit(q, a, 'RETRY_ENGINE_ANALYSIS', null, { reason: why });
      return { ok: true };
    });
  }
  async monitoring(a: Actor) {
    await this.check(a);
    return (
      await this.core.db.query(`SELECT
(SELECT count(*)::int FROM teams WHERE deleted=false) AS teams,
(SELECT count(*)::int FROM team_sessions WHERE status='ACTIVE') AS active_sessions,
(SELECT count(*)::int FROM team_sessions WHERE status='ACTIVE' AND role='DEBUGGING') AS debugging_participants,
(SELECT count(*)::int FROM chess_matches) AS chess_matches,
(SELECT count(*)::int FROM chess_matches WHERE status='ACTIVE') AS active_chess_games,
(SELECT count(*)::int FROM debugging_attempts WHERE status<>'ACTIVE') AS questions_answered,
(SELECT count(*)::int FROM debugging_attempts WHERE status='CORRECT') AS correct_answers,
(SELECT COALESCE(sum(chess_earned+debugging_earned+other_earned),0)::int FROM teams) AS points_earned,
(SELECT COALESCE(sum(spent),0)::int FROM teams) AS points_spent,
(SELECT count(*)::int FROM chess_moves WHERE captured_piece IS NOT NULL) AS pieces_captured,
(SELECT count(*)::int FROM chess_move_evaluations WHERE classification='Excellent') AS excellent_moves,
(SELECT count(*)::int FROM chess_move_evaluations WHERE classification='Blunder') AS blunders,
(SELECT count(*)::int FROM chess_move_evaluations WHERE status IN('PENDING_ANALYSIS','PROCESSING')) AS pending_analysis,
(SELECT count(*)::int FROM powerup_uses) AS powerups_used,
(SELECT count(*)::int FROM purchases WHERE kind='QUESTION') AS premium_questions_purchased,
(SELECT count(*)::int FROM purchases WHERE kind='SET') AS premium_sets_purchased,
(SELECT count(*)::int FROM outbox WHERE sent_at IS NULL) AS pending_events`)
    )[0];
  }
  async export(a: Actor, dataset: string) {
    await this.check(a);
    const map: Record<string, string> = {
      teams: 'SELECT id,name,enabled,created_at FROM teams',
      scores: 'SELECT id,name,balance,chess_earned,debugging_earned,other_earned,spent FROM teams',
      leaderboard:
        'SELECT id,name,chess_earned,debugging_earned,chess_earned+debugging_earned+other_earned AS total FROM teams ORDER BY total DESC,id',
      'chess-matches':
        'SELECT id,white_team,black_team,fen,ply,status,result,termination,created_at,completed_at FROM chess_matches',
      'chess-moves': 'SELECT * FROM chess_moves',
      'debugging-attempts':
        'SELECT id,team_id,question_id,round_id,started_at,expires_at,submitted_at,status,answer FROM debugging_attempts',
      transactions: 'SELECT * FROM point_transactions ORDER BY sequence',
      purchases: 'SELECT * FROM purchases',
      powerups: 'SELECT * FROM powerup_uses',
      audit: 'SELECT * FROM audit_logs',
      questions: 'SELECT * FROM debugging_questions',
      'question-sets': 'SELECT * FROM question_sets',
    };
    need(map[dataset], 'Unknown export dataset.', 404);
    return this.core.db.query(map[dataset]);
  }
}
export function csv(rows: any[]) {
  if (!rows.length) return '';
  const cell = (v: any) => {
    let s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const keys = Object.keys(rows[0]);
  return [keys.map(cell).join(','), ...rows.map((r) => keys.map((k) => cell(r[k])).join(','))].join(
    '\r\n',
  );
}
