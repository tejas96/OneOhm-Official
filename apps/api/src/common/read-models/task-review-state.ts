import type { TaskReturn } from '@oneohm/api-contracts';
import {
  activeUserIds,
  type DatabaseExecutor,
  holdersOf,
  taskReviews,
  users,
} from '@oneohm/database';
import { reviewersOf, type TaskReviewer } from '@oneohm/domain';
import { asc, eq, inArray } from 'drizzle-orm';

export interface ReviewState {
  readonly reviewerIds: string[];
  readonly returned: TaskReturn | null;
  readonly reworkCount: number;
}

interface TaskForReview {
  readonly id: string;
  readonly status: string;
  readonly reviewer: string;
  readonly managerUserId: string | null;
}

/** An inactive manager counts as no manager. */
const liveOnly = (id: string | null, live: ReadonlySet<string>) => (id && live.has(id) ? id : null);

const NONE: ReviewState = { reviewerIds: [], returned: null, reworkCount: 0 };

/**
 * For each task: who may sign it off while it is in review, the open "sent back" note the
 * assignee should see, and how many times its work was sent back (PRD 3.7, 3.12, 4.4).
 */
export async function reviewStates(
  db: DatabaseExecutor,
  tasks: readonly TaskForReview[],
): Promise<Map<string, ReviewState>> {
  const states = new Map<string, ReviewState>();
  if (tasks.length === 0) return states;
  const rows = await db
    .select({
      taskId: taskReviews.taskId,
      outcome: taskReviews.outcome,
      submittedBy: taskReviews.submittedByUserId,
      note: taskReviews.note,
      decidedAt: taskReviews.decidedAt,
      decidedBy: taskReviews.decidedByUserId,
      decidedByName: users.fullName,
    })
    .from(taskReviews)
    .leftJoin(users, eq(users.id, taskReviews.decidedByUserId))
    .where(
      inArray(
        taskReviews.taskId,
        tasks.map((task) => task.id),
      ),
    )
    .orderBy(asc(taskReviews.createdAt));
  const approvers = tasks.some((task) => task.status === 'in_review')
    ? await holdersOf(db, 'tasks.approve')
    : [];
  const live = await activeUserIds(
    db,
    tasks.map((task) => task.managerUserId),
  );
  for (const task of tasks) {
    const history = rows.filter((row) => row.taskId === task.id);
    const latest = history.at(-1);
    const reworkCount = history.filter((row) => row.outcome === 'returned').length;
    const reviewing = task.status === 'in_review';
    const open = latest?.outcome === 'returned' && !reviewing && task.status !== 'completed';
    states.set(task.id, {
      reworkCount,
      reviewerIds: reviewing
        ? [
            ...reviewersOf(
              {
                reviewer: task.reviewer as TaskReviewer,
                managerUserId: liveOnly(task.managerUserId, live),
                approvers,
              },
              latest?.outcome === 'pending' ? latest.submittedBy : null,
            ),
          ]
        : [],
      returned:
        open && latest
          ? {
              note: latest.note ?? '',
              by:
                latest.decidedBy && latest.decidedByName
                  ? { id: latest.decidedBy, fullName: latest.decidedByName }
                  : null,
              at: (latest.decidedAt ?? new Date()).toISOString(),
            }
          : null,
    });
  }
  return states;
}

export const reviewStateOf = (states: ReadonlyMap<string, ReviewState>, id: string) =>
  states.get(id) ?? NONE;
