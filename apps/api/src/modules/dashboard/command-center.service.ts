import { Inject, Injectable } from '@nestjs/common';
import type { CommandCenter, CommandCenterQuery, ProjectSummary } from '@oneohm/api-contracts';
import { leads, projects, projectTasks, quotations } from '@oneohm/database';
import { addDays, daysBetween, todayIn } from '@oneohm/shared';
import { and, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { projectSummaries } from '../../common/read-models/project-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { buildActions } from './command-center-actions';
import { deadlinesIn, decisionsWaiting, risksIn } from './command-center-lists';
import { moneyFigures } from './command-center-money';
import { type CenterScope, centerScope, indiaStart } from './command-center-scope';

const SEVERITY: Readonly<Record<ProjectSummary['tone'], number>> = {
  overdue: 0,
  waiting: 1,
  atRisk: 2,
  blocked: 3,
  review: 4,
  onTrack: 5,
  neutral: 6,
  done: 7,
};
const NEEDS_ATTENTION = new Set<ProjectSummary['tone']>([
  'overdue',
  'waiting',
  'atRisk',
  'blocked',
]);

/**
 * The owner's view of the whole business from deterministic formulas (PRD 3.1):
 * health = 40% delivery (open tasks not overdue) + 35% money (collected of what is due)
 * + 25% team (open tasks with an owner). Manager and type filters narrow the projects;
 * the period sets the window for installations, collections and sales.
 */
@Injectable()
export class CommandCenterService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(query: CommandCenterQuery = {}): Promise<CommandCenter> {
    const scope = centerScope(query, todayIn());
    const live = (await projectSummaries(this.db, scope.projects)).sort(
      (left, right) => SEVERITY[left.tone] - SEVERITY[right.tone],
    );
    const [money, open, installed, waitingDays, pipeline, risks, deadlines, decisions, actions] =
      await Promise.all([
        moneyFigures(this.db, scope.today, scope.start),
        this.openTasks(scope),
        this.installed(scope),
        this.waitingDays(scope),
        this.pipeline(scope),
        risksIn(this.db, scope),
        deadlinesIn(this.db, scope),
        decisionsWaiting(this.db),
        buildActions(this.db, scope.today),
      ]);
    const overdue = open.filter((task) => task.dueDate < scope.today).length;
    const unassigned = open.filter((task) => task.assignee === null).length;
    const delivery = open.length ? Math.round(100 * (1 - overdue / open.length)) : 100;
    const team = open.length ? Math.round((100 * (open.length - unassigned)) / open.length) : 100;
    const moneyScore =
      money.duePaise > 0 ? Math.round((100 * money.collectedPaise) / money.duePaise) : 100;
    const score = Math.round(0.4 * delivery + 0.35 * moneyScore + 0.25 * team);

    return {
      range: { start: scope.start, end: scope.end },
      generatedAt: new Date().toISOString(),
      narrowed: scope.narrowed,
      kpis: {
        liveProjects: live.length,
        needingAttention: live.filter((project) => NEEDS_ATTENTION.has(project.tone)).length,
        overdueTasks: overdue,
        openTasks: open.length,
        unassignedTasks: unassigned,
        quotationsSent: pipeline.quotations,
        quotationsAccepted: pipeline.accepted,
      },
      risks,
      decisions,
      deadlines,
      health: { score, delivery, money: Math.min(100, moneyScore), team },
      installed,
      collections: {
        collectedPaise: money.collectedPaise,
        duePaise: money.duePaise,
        weekly: money.weekly,
      },
      actions,
      waitingDays,
      pipeline,
      projects: live,
      money: {
        collectedPaise: money.collectedPaise,
        stillDuePaise: money.stillDuePaise,
        bankPendingPaise: money.bankPendingPaise,
        toVendorsPaise: money.toVendorsPaise,
        toContractorsPaise: money.toContractorsPaise,
        advancesPaise: money.advancesPaise,
      },
      liveProjects: live.length,
    };
  }

  private openTasks(scope: CenterScope) {
    return this.db
      .select({ assignee: projectTasks.assigneeUserId, dueDate: projectTasks.dueDate })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(and(scope.projects, ne(projectTasks.status, 'completed')));
  }

  /** Systems switched on in the period, and those due to be in the coming week. */
  private async installed(scope: CenterScope): Promise<CommandCenter['installed']> {
    const commissioning = and(
      eq(projectTasks.templateKey, 'testing_commissioning'),
      scope.narrowed ? scope.projects : undefined,
    );
    const done = await this.db
      .select({ capacityWp: projects.capacityWp, type: projects.type })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          commissioning,
          eq(projectTasks.status, 'completed'),
          gte(projectTasks.completedAt, indiaStart(scope.start)),
        ),
      );
    const due = await this.db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          commissioning,
          ne(projectTasks.status, 'completed'),
          sql`${projectTasks.dueDate} <= ${addDays(scope.today, 7)}`,
        ),
      );
    const ofType = (type: string) => done.filter((row) => row.type === type).length;
    return {
      wattsPeak: done.reduce((sum, row) => sum + row.capacityWp, 0),
      commissioned: done.length,
      dueThisWeek: due.length,
      byType: {
        residential: ofType('residential'),
        society: ofType('society'),
        commercial: ofType('commercial'),
      },
    };
  }

  /** Days tasks on the projects in view have spent waiting, by who they waited on. */
  private async waitingDays(scope: CenterScope): Promise<CommandCenter['waitingDays']> {
    const rows = await this.db
      .select({
        party: projectTasks.waitingParty,
        since: projectTasks.waitingSince,
        status: projectTasks.status,
        completedAt: projectTasks.completedAt,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(and(scope.projects, isNotNull(projectTasks.waitingSince)));
    const days = { internal: 0, customer: 0, bank: 0, discom: 0 };
    for (const row of rows) {
      if (!row.since) continue;
      const end =
        row.status === 'completed' && row.completedAt
          ? row.completedAt.toISOString().slice(0, 10)
          : scope.today;
      days[row.party] += Math.max(0, daysBetween(row.since.toISOString().slice(0, 10), end));
    }
    return days;
  }

  /** Sales in the period: new leads, how far they got, quotations sent and accepted. */
  private async pipeline(scope: CenterScope): Promise<CommandCenter['pipeline']> {
    const since = indiaStart(scope.start);
    const [leadRows, sent, accepted] = await Promise.all([
      this.db.select({ stage: leads.stage }).from(leads).where(gte(leads.createdAt, since)),
      this.db.select({ id: quotations.id }).from(quotations).where(gte(quotations.sentAt, since)),
      this.db
        .select({ id: quotations.id })
        .from(quotations)
        .where(gte(quotations.acceptedAt, since)),
    ]);
    return {
      leads: leadRows.length,
      surveys: leadRows.filter((row) => ['survey_scheduled', 'quoted', 'won'].includes(row.stage))
        .length,
      quotations: sent.length,
      accepted: accepted.length,
    };
  }
}
