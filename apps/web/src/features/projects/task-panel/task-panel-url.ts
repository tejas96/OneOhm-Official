export const TASK_PARAM = 'task';

/** The query string with the open task set, replaced or removed; '' when nothing is left. */
export function withTask(search: string, taskId: string | null): string {
  const query = new URLSearchParams(search);
  if (taskId) query.set(TASK_PARAM, taskId);
  else query.delete(TASK_PARAM);
  const text = query.toString();
  return text ? `?${text}` : '';
}
