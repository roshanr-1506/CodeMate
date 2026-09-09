import { randomUUID } from 'node:crypto';
import { Core, need, type Actor } from './core.js';
import { PointLedgerService } from './ledger.js';
import type { Query } from '../db.js';
export class DebuggingService {
  constructor(
    public core: Core,
    public ledger: PointLedgerService,
  ) {}
  async expire(q: Query) {
    const s = await this.core.settings(q);
    if (s.state === 'PAUSED') return;
    const rows = await q.query(
      "UPDATE debugging_attempts SET status='EXPIRED',submitted_at=$1 WHERE status='ACTIVE' AND expires_at<=$1 RETURNING *",
      [new Date(this.core.now())],
    );
    for (const a of rows) {
      await this.core.event(q, 'team:' + a.team_id, 'debugging:question_expired', {
        attemptId: a.id,
      });
      await this.core.audit(q, { team_id: a.team_id }, 'DEBUGGING_EXPIRED', a.id);
    }
  }
  async list(a: Actor) {
    const s = await this.core.settings();
    return this.core.db.query(
      'SELECT q.id,q.title,q.language,q.difficulty,q.points,q.time_limit,q.premium,qs.set_id,COALESCE(u.question_id IS NOT NULL, false) AS owned,a.status AS attempt_status FROM debugging_questions q LEFT JOIN question_set_questions qs ON qs.question_id=q.id LEFT JOIN team_question_unlocks u ON u.question_id=q.id AND u.team_id=$1 LEFT JOIN debugging_attempts a ON a.question_id=q.id AND a.team_id=$1 AND a.round_id=$2 WHERE q.active=true ORDER BY q.premium,q.id',
      [a.team_id, s.roundId],
    );
  }
  safe(a: any) {
    const { correct_answer, explanation, hint, ...question } = a.question_snapshot;
    const frozen = Math.max(0, new Date(a.frozen_until ?? 0).getTime() - this.core.now());
    return {
      id: a.id,
      questionId: a.question_id,
      status: a.status,
      question,
      expiresAt: a.expires_at,
      frozenUntil: a.frozen_until,
      remainingMs: Math.max(0, new Date(a.expires_at).getTime() - this.core.now() - frozen),
      serverNow: this.core.now(),
      removedOptions: a.removed_options,
      hint: a.hint_revealed ? hint : undefined,
      ...(a.status !== 'ACTIVE'
        ? { correctAnswer: correct_answer, explanation, answer: a.answer }
        : {}),
    };
  }
  async current(a: Actor) {
    return this.core.db.tx(async (q) => {
      await this.expire(q);
      const [row] = await q.query(
        "SELECT * FROM debugging_attempts WHERE team_id=$1 AND status='ACTIVE'",
        [a.team_id],
      );
      return row ? this.safe(row) : null;
    });
  }
  async start(a: Actor, id: string, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'DEBUGGING');
      return this.core.operation(q, a, op, ['start', id], async () => {
        const s = await this.core.active(q);
        await this.expire(q);
        const [existing] = await q.query(
          "SELECT * FROM debugging_attempts WHERE team_id=$1 AND status='ACTIVE'",
          [a.team_id],
        );
        if (existing) {
          need(existing.question_id === id, 'Finish your current question first.', 409);
          return this.safe(existing);
        }
        const [question] = await q.query(
          'SELECT * FROM debugging_questions WHERE id=$1 AND active=true',
          [id],
        );
        need(question, 'Question not found.', 404);
        need(
          !(
            await q.query(
              'SELECT 1 FROM debugging_attempts WHERE team_id=$1 AND question_id=$2 AND round_id=$3',
              [a.team_id, id, s.roundId],
            )
          ).length,
          'This question has already been submitted.',
          409,
        );
        if (question.premium)
          need(
            (
              await q.query(
                'SELECT 1 FROM team_question_unlocks WHERE team_id=$1 AND question_id=$2',
                [a.team_id, id],
              )
            ).length,
            'Unlock this question in the shop first.',
            403,
          );
        const [set] = await q.query(
          'SELECT s.* FROM question_sets s JOIN question_set_questions sq ON sq.set_id=s.id WHERE sq.question_id=$1',
          [id],
        );
        if (set) question.points = set.points_per_question;
        const [attempt] = await q.query(
          'INSERT INTO debugging_attempts(id,team_id,question_id,round_id,question_snapshot,started_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            randomUUID(),
            a.team_id,
            id,
            s.roundId,
            JSON.stringify(question),
            new Date(this.core.now()),
            new Date(this.core.now() + question.time_limit * 1000),
          ],
        );
        await this.core.audit(q, a, 'DEBUGGING_STARTED', attempt.id);
        const safe = this.safe(attempt);
        await this.core.event(q, 'team:' + a.team_id, 'debugging:question_started', safe);
        return safe;
      });
    });
  }
  async submit(a: Actor, id: string, answer: number, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'DEBUGGING');
      return this.core.operation(q, a, op, ['submit', id, answer], async () => {
        await this.core.active(q);
        need(Number.isInteger(answer) && answer >= 0 && answer <= 3, 'Select one answer.');
        const [attempt] = await q.query(
          'SELECT * FROM debugging_attempts WHERE team_id=$1 AND question_id=$2 ORDER BY started_at DESC LIMIT 1 FOR UPDATE',
          [a.team_id, id],
        );
        need(attempt, 'Start this question first.', 409);
        need(
          attempt.status === 'ACTIVE',
          attempt.status === 'EXPIRED' ? "Time's up!" : 'This question has already been submitted.',
          409,
        );
        if (new Date(attempt.expires_at).getTime() <= this.core.now()) {
          await q.query(
            "UPDATE debugging_attempts SET status='EXPIRED',submitted_at=$2 WHERE id=$1",
            [attempt.id, new Date(this.core.now())],
          );
          await this.core.event(q, 'team:' + a.team_id, 'debugging:question_expired', {
            attemptId: attempt.id,
          });
          return { ...this.safe({ ...attempt, status: 'EXPIRED' }), message: "Time's up!" };
        }
        need(!attempt.removed_options.includes(answer), 'That option was removed by a power-up.');
        const correct = answer === attempt.question_snapshot.correct_answer;
        const [updated] = await q.query(
          'UPDATE debugging_attempts SET status=$2,answer=$3,submitted_at=$4 WHERE id=$1 RETURNING *',
          [attempt.id, correct ? 'CORRECT' : 'INCORRECT', answer, new Date(this.core.now())],
        );
        if (correct)
          await this.ledger.awardPoints(q, {
            teamId: a.team_id,
            source: 'DEBUGGING',
            type: 'DEBUGGING_CORRECT',
            amount: attempt.question_snapshot.points,
            referenceId: attempt.id,
            operationId: 'debug:' + attempt.id,
            description: 'Correct answer! +' + attempt.question_snapshot.points,
          });
        await this.core.audit(q, a, 'DEBUGGING_SUBMISSION', attempt.id, { correct });
        const result = this.safe(updated);
        await this.core.event(q, 'team:' + a.team_id, 'debugging:answer_submitted', result);
        return result;
      });
    });
  }
  async history(a: Actor) {
    const rows = await this.core.db.query(
      "SELECT * FROM debugging_attempts WHERE team_id=$1 AND status<>'ACTIVE' ORDER BY started_at DESC LIMIT 100",
      [a.team_id],
    );
    return rows.map((r) => this.safe(r));
  }
}
