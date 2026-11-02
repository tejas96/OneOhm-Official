import { Inject, Injectable } from '@nestjs/common';
import type { DecideMonthInput, MonthlyPerson, MonthlyReview } from '@oneohm/api-contracts';
import { monthlyReviews, users } from '@oneohm/database';
import { monthOf } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { BonusesService } from './bonuses.service';
import { readMonth, readPersonMonth } from './monthly-review.read';

const LONG_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

/**
 * The owner's monthly review (spec 3.7): one decision per person and month, for months
 * that are over. Money is only proposed here; paying it needs the usual approval.
 */
@Injectable()
export class MonthlyReviewService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly bonuses: BonusesService,
  ) {}

  month(month: string): Promise<MonthlyReview> {
    return readMonth(this.db, month);
  }

  async person(userId: string, month: string): Promise<MonthlyPerson> {
    const [user] = await this.db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw notFound('That person');
    return readPersonMonth(this.db, user, month);
  }

  async decide(actor: Actor, userId: string, input: DecideMonthInput): Promise<MonthlyReview> {
    if (userId === actor.userId) throw forbidden('Someone else decides your month.');
    if (input.month >= monthOf(new Date()))
      throw invalid('Only a month that is over can be decided.', {
        month: 'Pick an earlier month.',
      });
    const [claimed] = await this.db
      .insert(monthlyReviews)
      .values({
        userId,
        month: input.month,
        decision: input.decision,
        note: input.note ?? null,
        decidedByUserId: actor.userId,
      })
      .onConflictDoNothing()
      .returning({ id: monthlyReviews.id });
    if (!claimed) throw conflict('This month is already decided.', 'decided');
    if (input.decision === 'bonus' && input.amountPaise) {
      try {
        const label = LONG_MONTH.format(new Date(`${input.month}-15T12:00:00Z`));
        const bonus = await this.bonuses.propose(actor, {
          projectId: null,
          reason: `Monthly review ${label}: ${input.note?.trim() || 'good work'}`,
          totalPaise: input.amountPaise,
          people: [{ userId, shares: 1 }],
        });
        await this.db
          .update(monthlyReviews)
          .set({ bonusId: bonus.id })
          .where(eq(monthlyReviews.id, claimed.id));
      } catch (error) {
        // The bonus was refused (limit, person): free the month so it can be decided again.
        await this.db
          .delete(monthlyReviews)
          .where(and(eq(monthlyReviews.id, claimed.id), eq(monthlyReviews.userId, userId)));
        throw error;
      }
    }
    await recordAudit(this.db, actor.userId, 'points.month_decided', 'user', userId, {
      month: input.month,
      decision: input.decision,
      amountPaise: input.amountPaise ?? null,
    });
    return readMonth(this.db, input.month);
  }
}
