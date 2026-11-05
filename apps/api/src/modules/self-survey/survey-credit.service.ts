import { Inject, Injectable } from '@nestjs/common';
import type { SurveyCredit } from '@oneohm/api-contracts';
import { type Database, milestoneCredits, paymentMilestones } from '@oneohm/database';
import { desc, eq } from 'drizzle-orm';
import { type Actor, assertCan } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE } from '../../config/core.module';
import { settleByHand } from './survey-credit-hand';

/** Finance's view of the self-survey discount of a project, and the hand settlement when no payment could take it. */
@Injectable()
export class SurveyCreditService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async of(actor: Actor, projectId: string): Promise<SurveyCredit[]> {
    assertCan(actor, 'finance.record_payments', 'projects.manage');
    const rows = await this.db
      .select({ credit: milestoneCredits, label: paymentMilestones.label })
      .from(milestoneCredits)
      .leftJoin(paymentMilestones, eq(paymentMilestones.id, milestoneCredits.milestoneId))
      .where(eq(milestoneCredits.projectId, projectId))
      .orderBy(desc(milestoneCredits.createdAt));
    return rows.map(({ credit, label }) => ({
      id: credit.id,
      amountPaise: credit.amountPaise,
      status: credit.status,
      milestoneLabel: label,
      settleNote: credit.settleNote,
      createdAt: credit.createdAt.toISOString(),
    }));
  }

  async settle(actor: Actor, id: string, reason: string): Promise<SurveyCredit> {
    assertCan(actor, 'finance.record_payments');
    const [found] = await this.db
      .select()
      .from(milestoneCredits)
      .where(eq(milestoneCredits.id, id));
    if (!found) throw notFound('That discount');
    const done = await this.db.transaction((tx) =>
      settleByHand(tx, { creditId: id, userId: actor.userId, reason }),
    );
    if (!done) throw conflict('This discount is not waiting to be settled.', 'not_pending');
    const [credit] = (await this.of(actor, found.projectId)).filter((one) => one.id === id);
    if (!credit) throw notFound('That discount');
    return credit;
  }
}
