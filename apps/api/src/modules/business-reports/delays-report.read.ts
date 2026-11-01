import { type DatabaseExecutor, discoms, projects, projectTasks } from '@oneohm/database';
import type { EpcStage, WaitingParty } from '@oneohm/domain';
import { daysBetween } from '@oneohm/shared';
import { and, eq, gte, lt, ne, or } from 'drizzle-orm';
import { indiaDate, type ReportScope } from './report-scope';

/** One task as the delays report sees it, read from the committed task columns. */
export interface DelayTaskRow {
  readonly id: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly projectName: string;
  readonly discomId: string;
  readonly discomCode: string;
  readonly discomName: string;
  readonly templateKey: string;
  readonly title: string;
  readonly stage: EpcStage;
  readonly status: string;
  readonly party: WaitingParty;
  readonly startDate: string;
  readonly dueDate: string;
  readonly startedAt: Date | null;
  readonly waitingSince: Date | null;
  readonly completedAt: Date | null;
}

/** The task with its lateness worked out for the period and today. */
export interface DelayFact extends DelayTaskRow {
  /** Finished inside the period (India dates). */
  readonly finished: boolean;
  /** Not finished yet, whatever the period. */
  readonly open: boolean;
  /** India date it finished, when it did. */
  readonly finishedOn: string | null;
  /** Finished: finish date − due date; open: today − due date; never below 0. */
  readonly daysLate: number;
  /** Open and marked waiting: today − the day it started waiting. */
  readonly waitingDays: number | null;
}

/** Tasks on the projects in view that finished in the period or are still open. */
export async function readDelayTasks(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<DelayTaskRow[]> {
  return db
    .select({
      id: projectTasks.id,
      projectId: projects.id,
      projectCode: projects.code,
      projectName: projects.name,
      discomId: discoms.id,
      discomCode: discoms.code,
      discomName: discoms.name,
      templateKey: projectTasks.templateKey,
      title: projectTasks.title,
      stage: projectTasks.stage,
      status: projectTasks.status,
      party: projectTasks.waitingParty,
      startDate: projectTasks.startDate,
      dueDate: projectTasks.dueDate,
      startedAt: projectTasks.startedAt,
      waitingSince: projectTasks.waitingSince,
      completedAt: projectTasks.completedAt,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(discoms, eq(discoms.id, projects.discomId))
    .where(
      and(
        scope.projects,
        or(
          ne(projectTasks.status, 'completed'),
          and(gte(projectTasks.completedAt, scope.from), lt(projectTasks.completedAt, scope.until)),
        ),
      ),
    );
}

/** Lateness of one task: counted to its finish date if it finished, else to today. */
export function delayFact(row: DelayTaskRow, scope: Pick<ReportScope, 'today' | 'meta'>) {
  const done = row.status === 'completed' && row.completedAt !== null;
  const finishedOn = done && row.completedAt ? indiaDate(row.completedAt) : null;
  const end = finishedOn ?? scope.today;
  const waiting = !done && row.status === 'waiting' && row.waitingSince !== null;
  const fact: DelayFact = {
    ...row,
    finished:
      finishedOn !== null &&
      finishedOn >= scope.meta.range.start &&
      finishedOn <= scope.meta.range.end,
    open: !done,
    finishedOn,
    daysLate: Math.max(0, daysBetween(row.dueDate, end)),
    waitingDays:
      waiting && row.waitingSince
        ? Math.max(0, daysBetween(indiaDate(row.waitingSince), scope.today))
        : null,
  };
  return fact;
}

/** Days a finished step took, from the day it started (else its planned start) to its finish. */
export function stepDays(fact: DelayFact): number | null {
  if (!fact.finishedOn) return null;
  const began = fact.startedAt ? indiaDate(fact.startedAt) : fact.startDate;
  return Math.max(0, daysBetween(began, fact.finishedOn));
}
