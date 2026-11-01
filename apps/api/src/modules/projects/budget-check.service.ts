import { Inject, Injectable } from '@nestjs/common';
import type { QuotationInput } from '@oneohm/api-contracts';
import {
  notifyHolders,
  projectActivities,
  projectFacts,
  projects,
  quotations,
} from '@oneohm/database';
import { compareWithSurvey } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { QuotationPricingService } from '../quotations/quotation-pricing.service';
import { QuotationsService } from '../quotations/quotations.service';
import { surveyedInput } from './survey-input';

/** The facts a survey records that change the price. */
export const SURVEY_FACTS = ['site_floors', 'structure_type', 'dc_cable_meters', 'ac_cable_meters'];

const signed = (paise: number) => `${paise >= 0 ? '+' : '−'}${formatInr(Math.abs(paise))}`;

/**
 * After the site survey (PRD 3.5, Flow A): the accepted quote is re-priced with what was
 * measured. Within the tolerance band the budget locks and only management sees the
 * difference; beyond it a revision is drafted for approval and the customer's OK.
 */
@Injectable()
export class BudgetCheckService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
    private readonly quotes: QuotationsService,
  ) {}

  async afterSurvey(actor: Actor, projectId: string): Promise<void> {
    const [project] = await this.db
      .select({
        code: projects.code,
        quotationId: projects.quotationId,
        budgetStatus: projects.budgetStatus,
        toleranceBp: quotations.toleranceBp,
      })
      .from(projects)
      .innerJoin(quotations, eq(quotations.id, projects.quotationId))
      .where(eq(projects.id, projectId))
      .limit(1);
    if (project?.budgetStatus !== 'awaiting_survey') return;
    const accepted = await this.quotes.get(project.quotationId);
    const facts = await this.db
      .select({ key: projectFacts.key, value: projectFacts.value })
      .from(projectFacts)
      .where(eq(projectFacts.projectId, projectId));
    const input: QuotationInput = surveyedInput(
      accepted.input,
      new Map(facts.map((f) => [f.key, f.value])),
    );
    const priced = await this.pricing.price(input);
    const variance = compareWithSurvey(
      accepted.totalPaise,
      priced.preview.totals.totalPaise,
      project.toleranceBp,
    );
    const percent = (variance.varianceBp / 100).toFixed(1);
    if (variance.withinTolerance) {
      await this.record(projectId, actor, {
        budgetStatus: 'locked',
        budgetLockedAt: new Date(),
        variance,
        message: `Survey checked: ${signed(variance.variancePaise)} (${percent}%), within tolerance. Budget locked.`,
      });
      return;
    }
    const revision = await this.quotes.create(actor, input, {
      id: accepted.id,
      number: accepted.number,
      revision: accepted.revision,
    });
    await this.record(projectId, actor, {
      budgetStatus: 'revision_needed',
      budgetLockedAt: null,
      revisionQuotationId: revision.id,
      variance,
      message: `Survey moved the price ${signed(variance.variancePaise)} (${percent}%), beyond tolerance. Revision ${revision.number} R${revision.revision} drafted for approval and the customer's OK.`,
    });
    await notifyHolders(
      this.db,
      'projects.manage',
      {
        kind: 'budget_revision',
        title: `Revision needed on ${project.code}`,
        body: `The survey moved the price ${signed(variance.variancePaise)} (${percent}%). Review and send revision R${revision.revision}.`,
        subject: { type: 'quotation', id: revision.id, projectId },
        dedupeKey: `budget_revision:${revision.id}`,
      },
      actor.userId,
    );
  }

  private async record(
    projectId: string,
    actor: Actor,
    change: {
      budgetStatus: string;
      budgetLockedAt: Date | null;
      revisionQuotationId?: string;
      variance: { variancePaise: number; varianceBp: number };
      message: string;
    },
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(projects)
        .set({
          budgetStatus: change.budgetStatus,
          budgetLockedAt: change.budgetLockedAt,
          surveyVariancePaise: change.variance.variancePaise,
          surveyVarianceBp: change.variance.varianceBp,
          revisionQuotationId: change.revisionQuotationId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId));
      await tx
        .insert(projectActivities)
        .values({ projectId, kind: 'budget', message: change.message, userId: actor.userId });
      await recordAudit(
        tx,
        actor.userId,
        `project.budget_${change.budgetStatus}`,
        'project',
        projectId,
        {
          variancePaise: change.variance.variancePaise,
          varianceBp: change.variance.varianceBp,
        },
      );
    });
  }
}
