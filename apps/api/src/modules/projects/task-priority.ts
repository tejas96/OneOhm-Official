import { type DatabaseExecutor, projectActivities, projectTasks } from '@oneohm/database';
import type { TaskPriority } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

const LABEL: Readonly<Record<TaskPriority, string>> = {
  none: 'No priority',
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

interface TaskRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly priority: TaskPriority;
}

/**
 * A manager sets a task's priority (spec 3.3). The same value again changes nothing, so
 * the history gets one line per real change, with who made it, even when saves race.
 */
export async function setPriority(
  tx: DatabaseExecutor,
  userId: string,
  task: TaskRow,
  priority: TaskPriority,
): Promise<void> {
  if (task.priority === priority) return;
  // Changed only if it still differs and is still open, so saves at the same moment, or
  // a completion in between, never write a second history line.
  const changed = await tx
    .update(projectTasks)
    .set({ priority, prioritySetByUserId: userId, updatedAt: new Date() })
    .where(
      and(
        eq(projectTasks.id, task.id),
        ne(projectTasks.priority, priority),
        ne(projectTasks.status, 'completed'),
      ),
    )
    .returning({ id: projectTasks.id });
  if (changed.length === 0) return;
  await tx.insert(projectActivities).values({
    projectId: task.projectId,
    taskId: task.id,
    kind: 'priority_set',
    message:
      priority === 'none'
        ? `${task.title}: priority removed.`
        : `${task.title}: priority set to ${LABEL[priority]}.`,
    userId,
    data: { from: task.priority, to: priority },
  });
  await recordAudit(tx, userId, 'task.priority_set', 'task', task.id, {
    from: task.priority,
    to: priority,
  });
}
