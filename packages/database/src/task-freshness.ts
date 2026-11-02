import { DEFAULT_ESCALATION, idleDays, isStale, type LeaveSpan, onLeave } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, max } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { escalationPolicy } from './schema/project-team.schema';
import { projectActivities, projectTasks } from './schema/projects.schema';
import { documents } from './schema/records.schema';
import { leaveRequests } from './schema/workforce.schema';

/** Leave further back than this cannot change whether a task is stale today. */
const LEAVE_LOOKBACK_DAYS = 120;

export interface TaskFreshnessInput {
  readonly id: string;
  readonly status: (typeof projectTasks.$inferSelect)['status'];
  readonly assigneeUserId: string | null;
  readonly updatedAt: Date;
}

export interface TaskFreshness {
  /** The latest of: the task row changing, a history line for it, a file on it. */
  readonly lastUpdateAt: Date;
  /** Days since then, leave days not counted. */
  readonly idleDays: number;
  readonly stale: boolean;
  /** The assignee is on approved leave today. */
  readonly assigneeOnLeave: boolean;
  /** First day of the leave that covers today, when there is one. */
  readonly assigneeLeaveFrom: string | null;
}

/** The stale threshold from Settings ("stuck after N days"), or the default. */
export async function staleThresholdDays(db: DatabaseExecutor): Promise<number> {
  const [row] = await db
    .select({ days: escalationPolicy.stuckInternalDays })
    .from(escalationPolicy)
    .where(eq(escalationPolicy.id, 'default'));
  return row?.days ?? DEFAULT_ESCALATION.stuckInternalDays;
}

/**
 * How fresh each task is (spec 3.5), from one place for the API and the morning job:
 * its last update, idle days without leave, and whether that makes it stale.
 */
export async function taskFreshness(
  db: DatabaseExecutor,
  tasks: readonly TaskFreshnessInput[],
  today: string,
): Promise<Map<string, TaskFreshness>> {
  const result = new Map<string, TaskFreshness>();
  if (tasks.length === 0) return result;
  const ids = tasks.map((task) => task.id);
  const people = [...new Set(tasks.map((task) => task.assigneeUserId).filter((id) => id !== null))];
  const [threshold, activity, files, leave] = await Promise.all([
    staleThresholdDays(db),
    db
      .select({ taskId: projectActivities.taskId, at: max(projectActivities.createdAt) })
      .from(projectActivities)
      .where(inArray(projectActivities.taskId, ids))
      .groupBy(projectActivities.taskId),
    db
      .select({ taskId: documents.taskId, at: max(documents.createdAt) })
      .from(documents)
      .where(inArray(documents.taskId, ids))
      .groupBy(documents.taskId),
    people.length
      ? db
          .select({
            userId: leaveRequests.userId,
            from: leaveRequests.fromDate,
            to: leaveRequests.toDate,
          })
          .from(leaveRequests)
          .where(
            and(
              inArray(leaveRequests.userId, people),
              eq(leaveRequests.status, 'approved'),
              gte(leaveRequests.toDate, addDays(today, -LEAVE_LOOKBACK_DAYS)),
            ),
          )
      : Promise.resolve([]),
  ]);
  // Indexed once, so large lists (the project list, the morning job) stay fast.
  const byTask = (rows: readonly { taskId: string | null; at: Date | null }[]) =>
    new Map(rows.map((row) => [row.taskId, row.at]));
  const lastActivity = byTask(activity);
  const lastFile = byTask(files);
  const leaveBy = new Map<string, LeaveSpan[]>();
  for (const row of leave) {
    const spans = leaveBy.get(row.userId) ?? [];
    spans.push({ from: row.from, to: row.to });
    leaveBy.set(row.userId, spans);
  }
  for (const task of tasks) {
    const times = [
      task.updatedAt,
      lastActivity.get(task.id) ?? null,
      lastFile.get(task.id) ?? null,
    ].filter((time): time is Date => time !== null);
    const lastUpdateAt = new Date(Math.max(...times.map((time) => time.getTime())));
    const spans = task.assigneeUserId ? (leaveBy.get(task.assigneeUserId) ?? []) : [];
    const lastUpdate = todayIn('Asia/Kolkata', lastUpdateAt);
    result.set(task.id, {
      lastUpdateAt,
      idleDays: idleDays(lastUpdate, today, spans),
      stale: isStale({
        status: task.status,
        lastUpdate,
        today,
        leave: spans,
        thresholdDays: threshold,
      }),
      assigneeOnLeave: onLeave(today, spans),
      assigneeLeaveFrom: spans.find((span) => span.from <= today && today <= span.to)?.from ?? null,
    });
  }
  return result;
}
