import {
  type DatabaseExecutor,
  leaveRequests,
  projectActivities,
  projectTasks,
  taskReviews,
  taskWaits,
} from '@oneohm/database';
import type { TaskPointFacts } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';

type TaskRow = typeof projectTasks.$inferSelect;

const indiaDay = (instant: Date) => todayIn('Asia/Kolkata', instant);
const ACCEPTED = ['approved', 'self_approved'];

/**
 * Who earns a finished task's points and the facts it is judged on (spec 3.7), read in
 * the same transaction that finishes it. Credit goes to whoever handed the work in:
 * the accepted hand-in for approval tasks, otherwise the person finishing it now.
 */
export async function taskPointFacts(
  tx: DatabaseExecutor,
  task: TaskRow,
  finishedBy: string,
): Promise<{ readonly userId: string; readonly facts: TaskPointFacts }> {
  const now = new Date();
  const reviews = await tx
    .select({
      outcome: taskReviews.outcome,
      submittedBy: taskReviews.submittedByUserId,
      at: taskReviews.createdAt,
    })
    .from(taskReviews)
    .where(eq(taskReviews.taskId, task.id))
    .orderBy(asc(taskReviews.createdAt));
  const accepted = task.approval
    ? reviews.filter((review) => ACCEPTED.includes(review.outcome)).at(-1)
    : undefined;
  const userId = accepted?.submittedBy ?? finishedBy;
  const handedInAt = accepted?.at ?? now;

  const [waits, leave, moves] = await Promise.all([
    tx
      .select({ party: taskWaits.party, from: taskWaits.startedAt, to: taskWaits.endedAt })
      .from(taskWaits)
      .where(eq(taskWaits.taskId, task.id)),
    tx
      .select({ from: leaveRequests.fromDate, to: leaveRequests.toDate })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'approved'))),
    tx
      .select({ data: projectActivities.data })
      .from(projectActivities)
      .where(
        and(
          eq(projectActivities.taskId, task.id),
          eq(projectActivities.userId, userId),
          inArray(projectActivities.kind, ['rescheduled']),
        ),
      ),
  ]);
  const outsideWaits = waits.map((wait) => ({
    party: wait.party,
    from: indiaDay(wait.from),
    to: indiaDay(wait.to),
  }));
  // A wait still open when the task finishes counts up to now.
  if (task.waitingSince && task.status === 'waiting')
    outsideWaits.push({
      party: task.waitingParty,
      from: indiaDay(task.waitingSince),
      to: indiaDay(now),
    });
  const selfMovedFrom = moves
    .map((move) => (move.data as { from?: unknown } | null)?.from)
    .filter((from): from is string => typeof from === 'string');

  return {
    userId,
    facts: {
      dueDate: task.dueDate,
      startDate: task.startDate,
      handedInOn: indiaDay(handedInAt),
      selfMovedFrom,
      outsideWaits,
      leave,
      needsApproval: task.approval,
      returns: reviews.filter((review) => review.outcome === 'returned').length,
    },
  };
}
