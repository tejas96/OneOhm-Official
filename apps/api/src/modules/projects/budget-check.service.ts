import { Inject, Injectable, Logger } from '@nestjs/common';
import type { QuotationInput } from '@oneohm/api-contracts';
import {
  notifyHolders,
  projectActivities,
  projectFacts,
  projects,
  projectTasks,
  quotations,
} from '@oneohm/database';
import { compareWithSurvey, SURVEY_FACT_KEYS } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, arrayOverlaps, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { QuotationPricingService } from '../quotations/quotation-pricing.service';
import { QuotationsService } from '../quotations/quotations.service';
import { surveyedInput } from './survey-input';

/** The facts a survey records that change the price. */
export const SURVEY_FACTS = SURVEY_FACT_KEYS;

/** True once a task recording the survey facts is approved and done. */
export async function surveyApproved(db: Database, projectId: string): Promise<boolean> {
  const [done] = await db
    .select({ id: projectTasks.id })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.projectId, projectId),
        eq(projectTasks.status, 'completed'),
        arrayOverlaps(projectTasks.captures, [...SURVEY_FACT_KEYS]),
      ),
    )
    .limit(1);
  return done !== undefined;
}

const signed = (paise: number) => `${paise >= 0 ? '+' : '−'}${formatInr(Math.abs(paise))}`;

/**
 * After the site survey (PRD 3.5, Flow A): the accepted quote is re-priced with what was
 * measured. Within the tolerance band the budget locks and only management sees the
 * difference; beyond it a revision is drafted for approval and the customer's OK.
 */
@Injectable()
export class BudgetCheckService {
  private readonly log = new Logger('BudgetCheck');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly pricing: QuotationPricingService,
    private readonly quotes: QuotationsService,
  ) {}

  /**
   * Runs after the survey is approved. A failure never undoes the survey, and is never
   * silent (PRD 7.1): the project records it and its managers are asked to recheck.
   */
  async afterSurvey(actor: Actor, projectId: string): Promise<void> {
    try {
      await this.check(actor, projectId);
    } catch (error) {
      await this.reportFailure(actor, projectId, error);
    }
  }

  /** "Recheck price" on the project, once the survey is done and the budget still open. */
  async recheck(actor: Actor, projectId: string): Promise<void> {
    const [project] = await this.db
      .select({ status: projects.budgetStatus })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    if (project.status !== 'awaiting_survey')
      throw conflict('The budget is already checked for this project.', 'budget_checked');
    if (!(await surveyApproved(this.db, projectId)))
      throw conflict('The site survey is not approved yet.', 'survey_open');
    await this.check(actor, projectId);
  }

  private async check(actor: Actor, projectId: string): Promise<void> {
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
    // Accepted snapshot prices and the roof check (PRD 3.5): only measurements count.
    const survey = await this.pricing.priceAfterSurvey(accepted, input, projectId);
    const priced = survey.priced;
    const variance = compareWithSurvey(
      accepted.totalPaise,
      priced.preview.totals.totalPaise,
      project.toleranceBp,
    );
    const percent = (variance.varianceBp / 100).toFixed(1);
    if (variance.withinTolerance && !survey.roofNote) {
      await this.record(projectId, actor, {
        budgetStatus: 'locked',
        budgetLockedAt: new Date(),
        variance,
        message: `Survey checked: ${signed(variance.variancePaise)} (${percent}%), within tolerance. Budget locked.`,
      });
      return;
    }
    const revision = await this.quotes.create(actor, survey.revisionInput, {
      id: accepted.id,
      number: accepted.number,
      revision: accepted.revision,
    });
    await this.record(projectId, actor, {
      budgetStatus: 'revision_needed',
      budgetLockedAt: null,
      revisionQuotationId: revision.id,
      variance,
      message: `${survey.roofNote ?? `Survey moved the price ${signed(variance.variancePaise)} (${percent}%), beyond tolerance.`} Revision ${revision.number} R${revision.revision} drafted for approval and the customer's OK.`,
    });
    await notifyHolders(
      this.db,
      'projects.manage',
      {
        kind: 'budget_revision',
        title: `Revision needed on ${project.code}`,
        body: `${survey.roofNote ?? `The survey moved the price ${signed(variance.variancePaise)} (${percent}%).`} Review and send revision R${revision.revision}.`,
        subject: { type: 'quotation', id: revision.id, projectId },
        dedupeKey: `budget_revision:${revision.id}`,
      },
      actor.userId,
    );
  }

  private async reportFailure(actor: Actor, projectId: string, error: unknown): Promise<void> {
    this.log.error(`Budget check failed for ${projectId}: ${String(error)}`);
    const [project] = await this.db
      .select({ code: projects.code })
      .from(projects)
      .where(eq(projects.id, projectId));
    await this.db.insert(projectActivities).values({
      projectId,
      kind: 'budget_check_failed',
      message: 'The survey price check could not run. The budget stays open until it is rechecked.',
      userId: actor.userId,
    });
    await notifyHolders(
      this.db,
      'projects.manage',
      {
        kind: 'budget_check_failed',
        title: `Price check failed on ${project?.code ?? 'a project'}`,
        body: 'The survey is approved but its price could not be checked. Open the project and choose Recheck price.',
        subject: { type: 'project', id: projectId, projectId },
        dedupeKey: `budget_check_failed:${projectId}:${new Date().toISOString().slice(0, 10)}`,
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
