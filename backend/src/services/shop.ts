import { randomUUID, randomInt } from 'node:crypto';
import { Core, need, type Actor, type Settings } from './core.js';
import { PointLedgerService } from './ledger.js';
import { DebuggingService } from './debugging.js';
export class ShopService {
  constructor(
    public core: Core,
    public ledger: PointLedgerService,
    public debug: DebuggingService,
  ) {}
  freezeAllowed(s: Settings) {
    if (s.endsAt)
      need(
        Date.parse(s.endsAt) - this.core.now() > s.freezeFinalSeconds * 1000,
        'Freeze Time is disabled in the final part of the round.',
        409,
      );
  }
  async catalog(a: Actor) {
    const q = this.core.db;
    return {
      powerups: await q.query(
        'SELECT p.*,COALESCE(t.quantity,0) AS owned FROM powerups p LEFT JOIN team_powerups t ON t.powerup_id=p.id AND t.team_id=$1 WHERE p.active ORDER BY p.cost,p.id',
        [a.team_id],
      ),
      questions: await q.query(
        'SELECT q.id,q.title,q.language,q.difficulty,q.points,(u.question_id IS NOT NULL) AS owned FROM debugging_questions q LEFT JOIN team_question_unlocks u ON u.question_id=q.id AND u.team_id=$1 WHERE q.premium AND q.active AND NOT EXISTS(SELECT 1 FROM question_set_questions s WHERE s.question_id=q.id) ORDER BY q.id',
        [a.team_id],
      ),
      sets: await q.query(
        'SELECT s.*,(u.set_id IS NOT NULL) AS owned,(SELECT count(*)::int FROM question_set_questions sq WHERE sq.set_id=s.id) AS question_count FROM question_sets s LEFT JOIN team_set_unlocks u ON u.set_id=s.id AND u.team_id=$1 WHERE s.active ORDER BY s.id',
        [a.team_id],
      ),
      individualPrice: (await this.core.settings()).individualQuestionPrice,
    };
  }
  async purchase(a: Actor, kind: string, id: string, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'DEBUGGING');
      return this.core.operation(q, a, op, ['purchase', kind, id], async () => {
        const s = await this.core.active(q, true);
        need(['POWERUP', 'QUESTION', 'SET'].includes(kind), 'Invalid product kind.');
        let item: any,
          cost = 0,
          questions: any[] = [];
        if (kind === 'POWERUP') {
          [item] = await q.query('SELECT * FROM powerups WHERE id=$1 AND active=true', [id]);
          need(item, 'This power-up is unavailable.', 404);
          cost = item.cost;
          if (item.effect === 'FREEZE') this.freezeAllowed(s);
        }
        if (kind === 'QUESTION') {
          [item] = await q.query(
            'SELECT * FROM debugging_questions WHERE id=$1 AND premium=true AND active=true AND NOT EXISTS(SELECT 1 FROM question_set_questions sq WHERE sq.question_id=$1)',
            [id],
          );
          need(item, 'This individual question is unavailable.', 404);
          need(
            !(
              await q.query(
                'SELECT 1 FROM team_question_unlocks WHERE team_id=$1 AND question_id=$2',
                [a.team_id, id],
              )
            ).length,
            'You already own this question.',
            409,
          );
          cost = s.individualQuestionPrice;
          questions = [item];
        }
        if (kind === 'SET') {
          [item] = await q.query('SELECT * FROM question_sets WHERE id=$1 AND active=true', [id]);
          need(item, 'This set is unavailable.', 404);
          need(
            !(
              await q.query('SELECT 1 FROM team_set_unlocks WHERE team_id=$1 AND set_id=$2', [
                a.team_id,
                id,
              ])
            ).length,
            'You already own this set.',
            409,
          );
          questions = await q.query(
            'SELECT q.* FROM debugging_questions q JOIN question_set_questions sq ON sq.question_id=q.id WHERE sq.set_id=$1',
            [id],
          );
          need(
            questions.length === 25 &&
              questions.every((x) => x.active && ['Hard', 'Expert'].includes(x.difficulty)) &&
              new Set(questions.map((x) => x.language)).size > 1,
            'This set is unavailable until its 25 mixed-language questions are configured.',
            409,
          );
          cost = item.price;
        }
        const purchaseId = randomUUID();
        await this.ledger.spendPoints(q, {
          teamId: a.team_id,
          source: 'ECONOMY',
          type: 'SHOP_PURCHASE',
          amount: -cost,
          referenceId: purchaseId,
          operationId: 'purchase:' + a.team_id + ':' + op,
          description: (item.name ?? item.title) + ' purchased −' + cost,
          metadata: { kind, itemId: id },
        });
        await q.query(
          'INSERT INTO purchases(id,team_id,kind,item_id,cost,operation_id) VALUES($1,$2,$3,$4,$5,$6)',
          [purchaseId, a.team_id, kind, id, cost, op],
        );
        if (kind === 'POWERUP')
          await q.query(
            'INSERT INTO team_powerups(team_id,powerup_id,quantity) VALUES($1,$2,1) ON CONFLICT(team_id,powerup_id) DO UPDATE SET quantity=team_powerups.quantity+1',
            [a.team_id, id],
          );
        else {
          if (kind === 'SET')
            await q.query(
              'INSERT INTO team_set_unlocks(team_id,set_id,purchase_id) VALUES($1,$2,$3)',
              [a.team_id, id, purchaseId],
            );
          for (const question of questions)
            await q.query(
              'INSERT INTO team_question_unlocks(team_id,question_id,purchase_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
              [a.team_id, question.id, purchaseId],
            );
        }
        const result = { id: purchaseId, kind, itemId: id, cost, unlocked: questions.length };
        await this.core.audit(q, a, 'SHOP_PURCHASE', purchaseId, result);
        await this.core.event(q, 'team:' + a.team_id, 'team:purchase_completed', result);
        await this.core.event(q, 'team:' + a.team_id, 'team:powerup_updated', {});
        return result;
      });
    });
  }
  async use(a: Actor, powerupId: string, attemptId: string, op: string) {
    return this.core.db.tx(async (q) => {
      await this.core.authorize(q, a, 'DEBUGGING');
      return this.core.operation(q, a, op, ['powerup', powerupId, attemptId], async () => {
        const s = await this.core.active(q);
        const [attempt] = await q.query(
          'SELECT * FROM debugging_attempts WHERE id=$1 AND team_id=$2 FOR UPDATE',
          [attemptId, a.team_id],
        );
        need(
          attempt && attempt.status === 'ACTIVE',
          'Start a question before using a power-up.',
          409,
        );
        need(new Date(attempt.expires_at).getTime() > this.core.now(), "Time's up!", 409);
        const [p] = await q.query(
          'SELECT p.*,t.quantity FROM powerups p JOIN team_powerups t ON t.powerup_id=p.id WHERE p.id=$1 AND t.team_id=$2 AND p.active=true',
          [powerupId, a.team_id],
        );
        need(p && p.quantity > 0, 'You do not own this power-up.', 409);
        const [{ count }] = await q.query(
          'SELECT count(*)::int AS count FROM powerup_uses u JOIN powerups p ON p.id=u.powerup_id WHERE u.attempt_id=$1 AND p.effect=$2',
          [attemptId, p.effect],
        );
        need(count < p.usage_limit, 'This power-up has reached its limit for this question.', 409);
        let duration = 0;
        const removed = [...attempt.removed_options];
        let expires = new Date(attempt.expires_at).getTime(),
          frozen = attempt.frozen_until ? new Date(attempt.frozen_until).getTime() : null,
          status = 'ACTIVE',
          hint = attempt.hint_revealed;
        if (p.effect === 'FREEZE') {
          this.freezeAllowed(s);
          const [{ used }] = await q.query(
            "SELECT COALESCE(sum(u.duration),0)::int AS used FROM powerup_uses u JOIN powerups p ON p.id=u.powerup_id WHERE u.team_id=$1 AND u.round_id=$2 AND p.effect='FREEZE'",
            [a.team_id, s.roundId],
          );
          need(
            used + p.duration <= s.freezeLimitSeconds,
            'Your team has reached the round’s Freeze Time limit.',
            409,
          );
          duration = p.duration;
          expires += duration * 1000;
          frozen = Math.max(this.core.now(), frozen ?? 0) + duration * 1000;
        }
        if (p.effect === 'EXTRA') {
          duration = p.duration;
          expires += duration * 1000;
        }
        if (p.effect === 'HALF' || p.effect === 'BLAST') {
          const wrong = [0, 1, 2, 3].filter(
            (v) => v !== attempt.question_snapshot.correct_answer && !removed.includes(v),
          );
          const count = p.effect === 'HALF' ? 2 : 1;
          need(
            wrong.length >= count,
            'Not enough incorrect options remain for this power-up.',
            409,
          );
          for (let i = 0; i < count; i++) {
            const index = randomInt(wrong.length);
            removed.push(wrong.splice(index, 1)[0]);
          }
        }
        if (p.effect === 'SKIP') status = 'SKIPPED';
        if (p.effect === 'HINT') {
          need(!hint, 'The hint is already revealed.', 409);
          hint = true;
        }
        await q.query(
          'UPDATE team_powerups SET quantity=quantity-1 WHERE team_id=$1 AND powerup_id=$2',
          [a.team_id, powerupId],
        );
        await q.query(
          'INSERT INTO powerup_uses(id,team_id,attempt_id,powerup_id,round_id,duration,operation_id) VALUES($1,$2,$3,$4,$5,$6,$7)',
          [randomUUID(), a.team_id, attemptId, powerupId, s.roundId, duration, op],
        );
        const [updated] = await q.query(
          "UPDATE debugging_attempts SET expires_at=$2,frozen_until=$3,removed_options=$4,hint_revealed=$5,status=$6,submitted_at=CASE WHEN $6='SKIPPED' THEN $7 ELSE submitted_at END WHERE id=$1 RETURNING *",
          [
            attemptId,
            new Date(expires),
            frozen ? new Date(frozen) : null,
            JSON.stringify(removed),
            hint,
            status,
            new Date(this.core.now()),
          ],
        );
        await this.ledger.change(q, {
          teamId: a.team_id,
          type: 'POWERUP_USE',
          source: 'ECONOMY',
          amount: 0,
          referenceId: attemptId,
          operationId: 'use:' + a.team_id + ':' + op,
          description: p.name + ' activated!',
        });
        await this.core.audit(q, a, 'POWERUP_ACTIVATION', attemptId, { powerupId, duration });
        const result = this.debug.safe(updated);
        await this.core.event(q, 'team:' + a.team_id, 'team:powerup_updated', result);
        return result;
      });
    });
  }
}
