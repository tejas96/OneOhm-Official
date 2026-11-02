import type { TaskPriority } from '@oneohm/domain';
import { TASK } from '../../copy/tasks';

/** The small priority label on a task row; Urgent stands out, none shows nothing. */
export function priorityMark(
  priority: TaskPriority | undefined,
): { readonly label: string; readonly loud: boolean } | null {
  if (!priority || priority === 'none') return null;
  return { label: TASK.priority[priority], loud: priority === 'urgent' };
}
