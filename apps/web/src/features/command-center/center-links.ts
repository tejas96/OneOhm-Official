import type { CommandCenterQuery } from '@oneohm/api-contracts';

type Extra = Readonly<Record<string, string | null | undefined>>;

/**
 * A link that carries the command centre's filters (period, manager, type) to the
 * records behind a number, plus anything the target needs (`show`, `health`, …).
 * Reports, the task list and the projects list all read these same names.
 */
export function centerHref(path: string, query: CommandCenterQuery, extra: Extra = {}): string {
  const [base, existing] = path.split('?');
  const params = new URLSearchParams(existing);
  if (query.period && query.period !== 'this_month') params.set('period', query.period);
  if (query.managerUserId) params.set('manager', query.managerUserId);
  if (query.projectType) params.set('type', query.projectType);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const suffix = params.toString();
  return suffix ? `${base}?${suffix}` : (base ?? path);
}
