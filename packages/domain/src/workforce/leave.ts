import { addDays, daysBetween } from '@oneohm/shared';

/**
 * Leave counted in half days, so a half day is exact: the working days from `from` to
 * `to` (inclusive), skipping weekly offs. A one-day half-day request counts as one half.
 */
export function leaveHalfDays(input: {
  readonly from: string;
  readonly to: string;
  readonly halfDay: boolean;
  readonly weeklyOff: readonly number[];
}): number {
  const span = daysBetween(input.from, input.to);
  if (span < 0) return 0;
  let working = 0;
  for (let offset = 0; offset <= span; offset += 1) {
    const day = new Date(`${addDays(input.from, offset)}T00:00:00Z`).getUTCDay();
    if (!input.weeklyOff.includes(day)) working += 1;
  }
  if (input.halfDay && span === 0 && working === 1) return 1;
  return working * 2;
}

/** Whether two inclusive date ranges share a day. */
export function overlaps(
  a: { readonly from: string; readonly to: string },
  b: { readonly from: string; readonly to: string },
): boolean {
  return a.from <= b.to && b.from <= a.to;
}

export interface BackupCandidate {
  readonly userId: string;
  readonly fullName: string;
  /** Role keys the person holds. */
  readonly roleKeys: readonly string[];
  readonly openTasks: number;
  /** Already away for part of the window. */
  readonly onLeave: boolean;
}

/**
 * Who can cover: people who share a role with the tasks being handed over, not away
 * themselves, least loaded first (PRD 4.6, Flow E).
 */
export function suggestBackups(
  taskRoleKeys: readonly string[],
  candidates: readonly BackupCandidate[],
  limit = 3,
): BackupCandidate[] {
  const wanted = new Set(taskRoleKeys);
  return candidates
    .filter((person) => !person.onLeave)
    .map((person) => ({
      person,
      shared: person.roleKeys.filter((role) => wanted.has(role)).length,
    }))
    .filter(({ shared }) => wanted.size === 0 || shared > 0)
    .sort(
      (a, b) =>
        b.shared - a.shared ||
        a.person.openTasks - b.person.openTasks ||
        a.person.fullName.localeCompare(b.person.fullName),
    )
    .slice(0, limit)
    .map(({ person }) => person);
}
