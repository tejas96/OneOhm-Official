import { Inject, Injectable } from '@nestjs/common';
import type { CommandCenter, CommandCenterQuery, ProjectSummary } from '@oneohm/api-contracts';
import { projects, projectTasks } from '@oneohm/database';
import { ATTENTION_TONES, finishWindow } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, ne } from 'drizzle-orm';
import { projectSummaries } from '../../common/read-models/project-summary';
import { DATABASE, type Database } from '../../config/core.module';
import { buildActions } from './command-center-actions';
import { decisionsWaiting } from './command-center-decisions';
import { installed, pipeline, waitingDays } from './command-center-flows';
import { deadlinesIn, risksIn } from './command-center-lists';
import { materialRisks } from './command-center-materials';
import { moneyFigures } from './command-center-money';
import { type CenterScope, centerScope } from './command-center-scope';

const SEVERITY: Readonly<Record<ProjectSummary['tone'], number>> = {
  overdue: 0,
  blocked: 1,
  waiting: 2,
  atRisk: 3,
  review: 4,
  onTrack: 5,
  neutral: 6,
  done: 7,
};

/**
 * The owner's view of the whole business from deterministic formulas (PRD 3.1):
 * health = 40% delivery (open tasks not overdue) + 35% money (collected of what is due)
 * + 25% team (open tasks with an owner). Manager and type filters narrow the projects;
 * the period sets the window for installations, collections, sales and completions.
 */
@Injectable()
export class CommandCenterService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async get(query: CommandCenterQuery = {}): Promise<CommandCenter> {
    const scope = centerScope(query, todayIn());
    const [live, completed] = await Promise.all([
      projectSummaries(this.db, scope.projects),
      projectSummaries(this.db, scope.completed),
    ]);
    live.sort((left, right) => SEVERITY[left.tone] - SEVERITY[right.tone]);
    const [money, open, flows, lists] = await Promise.all([
      moneyFigures(this.db, scope.today, scope.start),
      this.openTasks(scope),
      Promise.all([
        installed(this.db, scope),
        waitingDays(this.db, scope),
        pipeline(this.db, scope),
      ]),
      Promise.all([
        risksIn(this.db, scope),
        deadlinesIn(this.db, scope),
        decisionsWaiting(this.db),
        buildActions(this.db, scope.today),
        materialRisks(this.db, scope),
      ]),
    ]);
    const [installedFigures, waiting, sales] = flows;
    const [risks, deadlines, decisions, actions, materials] = lists;
    const overdue = open.filter((task) => task.dueDate < scope.today).length;
    const unassigned = open.filter((task) => task.assignee === null).length;
    const delivery = open.length ? Math.round(100 * (1 - overdue / open.length)) : 100;
    const team = open.length ? Math.round((100 * (open.length - unassigned)) / open.length) : 100;
    const moneyScore =
      money.duePaise > 0 ? Math.round((100 * money.collectedPaise) / money.duePaise) : 100;
    const score = Math.round(0.4 * delivery + 0.35 * moneyScore + 0.25 * team);
    const finished = completed.filter(
      (project) => project.completedOn !== null && project.completedOn >= scope.start,
    );

    return {
      range: { start: scope.start, end: scope.end },
      generatedAt: new Date().toISOString(),
      narrowed: scope.narrowed,
      kpis: {
        liveProjects: live.length,
        needingAttention: live.filter((project) => ATTENTION_TONES.includes(project.tone)).length,
        overdueTasks: overdue,
        openTasks: open.length,
        unassignedTasks: unassigned,
        quotationsSent: sales.quotations,
        quotationsAccepted: sales.accepted,
      },
      risks,
      decisions,
      deadlines,
      health: { score, delivery, money: Math.min(100, moneyScore), team },
      installed: installedFigures,
      collections: {
        collectedPaise: money.collectedPaise,
        duePaise: money.duePaise,
        weekly: money.weekly,
      },
      actions,
      waitingDays: waiting,
      pipeline: sales,
      projects: live,
      states: projectStates(live, finished),
      outlook: outlook(live, scope.today),
      materials,
      money: {
        revenuePaise: money.revenuePaise,
        collectedPaise: money.collectedPaise,
        stillDuePaise: money.stillDuePaise,
        bankPendingPaise: money.bankPendingPaise,
        toVendorsPaise: money.toVendorsPaise,
        toContractorsPaise: money.toContractorsPaise,
        dueThisWeekPaise: money.dueThisWeekPaise,
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
}

/** Live projects by tone, and the projects whose work finished in the period. */
function projectStates(
  live: readonly ProjectSummary[],
  finished: readonly ProjectSummary[],
): CommandCenter['states'] {
  const count = (tone: ProjectSummary['tone']) =>
    live.filter((project) => project.tone === tone).length;
  return {
    onTrack: count('onTrack'),
    atRisk: count('atRisk'),
    waiting: count('waiting'),
    blocked: count('blocked'),
    overdue: count('overdue'),
    completed: finished.length,
    completedUnpaid: finished.filter((project) => project.tone !== 'done').length,
  };
}

/** When the live projects are expected to finish, by month (`deliveryForecast`). */
function outlook(live: readonly ProjectSummary[], today: string): CommandCenter['outlook'] {
  const windows = live.flatMap((project) =>
    project.forecast.expectedFinish ? [finishWindow(project.forecast.expectedFinish, today)] : [],
  );
  const behind = live.filter((project) => project.forecast.slipDays > 0);
  return {
    thisMonth: windows.filter((window) => window === 'this_month').length,
    nextMonth: windows.filter((window) => window === 'next_month').length,
    later: windows.filter((window) => window === 'later').length,
    behindPlan: behind.length,
    averageSlipDays: behind.length
      ? Math.round(
          behind.reduce((sum, project) => sum + project.forecast.slipDays, 0) / behind.length,
        )
      : 0,
  };
}
