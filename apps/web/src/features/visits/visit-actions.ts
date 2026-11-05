import type { Visit } from '@oneohm/api-contracts';

const OPEN = new Set<Visit['status']>(['proposed', 'confirmed']);

/** What the team can do with the visit on show: open ones confirm / done / cancel, a missed one is done or booked again. */
export function visitActions(visit: Pick<Visit, 'status'> | undefined) {
  const status = visit?.status;
  return {
    open: status !== undefined && OPEN.has(status),
    confirm: status === 'proposed',
    done: status === 'confirmed' || status === 'missed',
    cancel: status !== undefined && OPEN.has(status),
    bookAgain: status === 'missed',
  };
}

/** "Task starts X, visit is Y" is only worth saying about a visit the team have confirmed. */
export const showsTaskDifference = (
  visit: Pick<Visit, 'status' | 'day'> | undefined,
  taskStart: string | null,
): boolean => visit?.status === 'confirmed' && taskStart !== null && taskStart !== visit.day;
