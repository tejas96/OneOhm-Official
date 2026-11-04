export const TASK_PARAM = 'task';

/** The query string with the open task set, replaced or removed; '' when nothing is left. */
export function withTask(search: string, taskId: string | null): string {
  const query = new URLSearchParams(search);
  if (taskId) query.set(TASK_PARAM, taskId);
  else query.delete(TASK_PARAM);
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** A link (path plus query) that also opens a task's panel, e.g. `/projects/p1?tab=tasks&task=t1`. */
export function hrefWithTask(href: string, taskId: string): string {
  const [path = '', search = ''] = href.split('?');
  return `${path}${withTask(search, taskId)}`;
}

/** Opening a panel adds a history entry, so Back closes it; other changes replace it. */
export function panelNavigation(
  currentId: string | null,
  nextId: string | null,
): 'push' | 'replace' {
  return currentId === null && nextId !== null ? 'push' : 'replace';
}

export type PanelView = 'loading' | 'missing' | 'error' | 'body';

/**
 * What the panel shows. A task already loaded stays on screen when a later refetch fails,
 * so a short network error never wipes an open form.
 */
export function panelView(state: {
  readonly data: unknown;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly missing: boolean;
}): PanelView {
  if (state.data) return 'body';
  if (state.isError) return state.missing ? 'missing' : 'error';
  return 'loading';
}

/**
 * Which task the panel shows, and whether it is open. When the link drops the task, the
 * last one stays on screen (closed) so the panel can slide away instead of vanishing.
 */
export function panelShown(
  lastShown: string | null,
  taskId: string | null,
): { readonly id: string | null; readonly open: boolean } {
  if (taskId) return { id: taskId, open: true };
  return { id: lastShown, open: false };
}
