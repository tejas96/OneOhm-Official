export const TASK_PARAM = 'task';

/** The query string with the open task set, replaced or removed; '' when nothing is left. */
export function withTask(search: string, taskId: string | null): string {
  const query = new URLSearchParams(search);
  if (taskId) query.set(TASK_PARAM, taskId);
  else query.delete(TASK_PARAM);
  const text = query.toString();
  return text ? `?${text}` : '';
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
