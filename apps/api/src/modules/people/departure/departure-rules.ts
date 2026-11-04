import type { RoleKind } from '@oneohm/domain';

export type RemovalProblem =
  | 'remove_self'
  | 'target_is_leaver'
  | 'target_not_active'
  | 'target_is_reseller'
  | 'target_not_staff'
  | 'future_date';

/** First reason a removal cannot go ahead, or null. Dates are `YYYY-MM-DD`, so they compare as text. */
export function checkRemoval(input: {
  actorId: string;
  leaverId: string;
  target: { id: string; status: 'active' | 'inactive'; kinds: RoleKind[] } | null;
  lastWorkingDay: string;
  today: string;
}): RemovalProblem | null {
  const { actorId, leaverId, target, lastWorkingDay, today } = input;
  if (actorId === leaverId) return 'remove_self';
  if (target?.id === leaverId) return 'target_is_leaver';
  if (target?.status !== 'active') return 'target_not_active';
  if (target.kinds.every((kind) => kind === 'reseller')) return 'target_is_reseller';
  // Leads, tasks and projects need someone on the staff side, not a crew or reseller.
  if (!target.kinds.includes('staff')) return 'target_not_staff';
  if (lastWorkingDay > today) return 'future_date';
  return null;
}

/** Each report moves under the target; the target itself moves up to the leaver's manager. */
export function newManagers(input: {
  leaverId: string;
  leaverManagerId: string | null;
  targetId: string;
  reportIds: readonly string[];
}): Map<string, string | null> {
  const moves = new Map<string, string | null>();
  for (const reportId of input.reportIds) {
    const next = reportId === input.targetId ? input.leaverManagerId : input.targetId;
    moves.set(reportId, next === reportId ? null : next);
  }
  return moves;
}
