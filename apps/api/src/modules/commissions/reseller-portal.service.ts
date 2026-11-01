import { Inject, Injectable } from '@nestjs/common';
import type { ResellerCustomer, ResellerEarnings } from '@oneohm/api-contracts';
import { commissionEntries, projectTasks } from '@oneohm/database';
import { commissionPaise, EPC_STAGES, type EpcStage, incentiveTotals } from '@oneohm/domain';
import { eq, inArray } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { DATABASE, type Database } from '../../config/core.module';
import { type ProjectFacts, projectFacts, projectsOfLeads } from '../referrals/project-events';
import { CommissionEntriesService } from './commission-entries.service';
import { effectiveRule, loadRules, presentRule, type RuleRow } from './commission-rules';
import { resellerLeads } from './reseller-attribution';

type Progress = { stage: EpcStage; progressBp: number };

/** Stage and share of tasks done, from the project's tasks (no internal notes). */
async function progressOf(db: Database, projectIds: string[]): Promise<Map<string, Progress>> {
  const result = new Map<string, Progress>();
  if (projectIds.length === 0) return result;
  const tasks = await db
    .select({
      projectId: projectTasks.projectId,
      stage: projectTasks.stage,
      status: projectTasks.status,
    })
    .from(projectTasks)
    .where(inArray(projectTasks.projectId, projectIds));
  for (const id of projectIds) {
    const own = tasks.filter((task) => task.projectId === id);
    const open = own.filter((task) => task.status !== 'completed');
    const stage =
      EPC_STAGES.find((value) => open.some((task) => task.stage === value)) ?? 'subsidy';
    const progressBp = own.length
      ? Math.round(((own.length - open.length) * 10_000) / own.length)
      : 0;
    result.set(id, { stage, progressBp });
  }
  return result;
}

const estimate = (rule: RuleRow | null, project: ProjectFacts) =>
  rule?.active ? commissionPaise(rule, project) : 0;

/**
 * A signed-in reseller's own customers and commission (PRD 4.8). Only leads they
 * brought or own; never margins, internal notes or another reseller's leads.
 */
@Injectable()
export class ResellerPortalService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly entries: CommissionEntriesService,
  ) {}

  async customers(actor: Actor): Promise<ResellerCustomer[]> {
    const { leads, projectOf, facts, earned, rule } = await this.book(actor);
    const progress = await progressOf(this.db, [...facts.keys()]);
    return leads
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((lead) => {
        const projectId = projectOf.get(lead.id);
        const project = projectId ? facts.get(projectId) : undefined;
        const entry = projectId ? earned.get(projectId) : undefined;
        const step = project ? progress.get(project.id) : undefined;
        const upcoming = project ? estimate(rule, project) : 0;
        return {
          leadId: lead.id,
          name: lead.name,
          city: lead.city,
          leadStage: lead.stage,
          estimatedWp: lead.estimatedWp,
          createdAt: lead.createdAt.toISOString(),
          project: project
            ? {
                id: project.id,
                code: project.code,
                capacityWp: project.capacityWp,
                status: project.status,
                currentStage: step?.stage ?? 'survey',
                progressBp: step?.progressBp ?? 0,
                valuePaise: project.valuePaise,
                startDate: project.startDate,
              }
            : null,
          commission: entry
            ? { status: entry.status, amountPaise: entry.amountPaise }
            : upcoming > 0 && project?.status !== 'cancelled'
              ? { status: 'upcoming' as const, amountPaise: upcoming }
              : null,
        };
      });
  }

  async earnings(actor: Actor): Promise<ResellerEarnings> {
    const { facts, earned, rule } = await this.book(actor);
    const list = await this.entries.list({ status: 'all', resellerId: actor.userId });
    const upcomingPaise = [...facts.values()]
      .filter((project) => !earned.has(project.id) && project.status !== 'cancelled')
      .reduce((sum, project) => sum + estimate(rule, project), 0);
    return {
      rule: presentRule(rule, null),
      totals: incentiveTotals(list),
      upcomingPaise,
      entries: list.map(({ reseller: _reseller, approvedBy: _approvedBy, ...entry }) => entry),
    };
  }

  /** The reseller's leads, their projects, earned entries and the rule that applies. */
  private async book(actor: Actor) {
    const leads = await resellerLeads(this.db, [actor.userId]);
    const projectOf = await projectsOfLeads(
      this.db,
      leads.map((lead) => lead.id),
    );
    const facts = await projectFacts(this.db, [...projectOf.values()]);
    const rows = await this.db
      .select({
        projectId: commissionEntries.projectId,
        status: commissionEntries.status,
        amountPaise: commissionEntries.amountPaise,
      })
      .from(commissionEntries)
      .where(eq(commissionEntries.resellerUserId, actor.userId));
    const earned = new Map(rows.map((row) => [row.projectId, row]));
    const { rule } = effectiveRule(await loadRules(this.db), actor.userId);
    return { leads, projectOf, facts, earned, rule };
  }
}
