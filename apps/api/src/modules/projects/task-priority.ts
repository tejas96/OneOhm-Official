import {
  type DatabaseExecutor,
  notify,
  projectActivities,
  projects,
  projectTasks,
} from '@oneohm/database';
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
  readonly assigneeUserId: string | null;
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
  const [line] = await tx
    .insert(projectActivities)
    .values({
      projectId: task.projectId,
      taskId: task.id,
      kind: 'priority_set',
      message:
        priority === 'none'
          ? `${task.title}: priority removed.`
          : `${task.title}: priority set to ${LABEL[priority]}.`,
      userId,
      data: { from: task.priority, to: priority },
    })
    .returning({ id: projectActivities.id });
  await recordAudit(tx, userId, 'task.priority_set', 'task', task.id, {
    from: task.priority,
    to: priority,
  });
  if (priority === 'urgent' && line) await tellUrgent(tx, userId, task, line.id);
}

/**
 * The one new instant notice (spec 3.5): the person doing the task hears it is Urgent
 * now, once per change to Urgent, and not when they marked it themselves.
 */
async function tellUrgent(
  tx: DatabaseExecutor,
  userId: string,
  task: TaskRow,
  lineId: string,
): Promise<void> {
  if (!task.assigneeUserId || task.assigneeUserId === userId) return;
  const [project] = await tx
    .select({ code: projects.code })
    .from(projects)
    .where(eq(projects.id, task.projectId));
  await notify(
    tx,
    { userId: task.assigneeUserId },
    {
      kind: 'task_urgent',
      title: `Marked Urgent on ${project?.code ?? 'a project'}`,
      body: `${task.title}. Do this first.`,
      subject: { type: 'task', id: task.id, projectId: task.projectId },
      dedupeKey: `urgent:${task.id}:${lineId}`,
    },
  );
}
