const DAY = 86_400_000;

/**
 * Whether a paper still counts for a checklist item with a maximum age (redesign 5.4): it
 * does when the item has no maximum, or the paper was received within that many days.
 */
export function isCurrentPaper(
  receivedAt: Date,
  maxAgeDays: number | null | undefined,
  now: Date,
): boolean {
  if (!maxAgeDays) return true;
  return now.getTime() - receivedAt.getTime() <= maxAgeDays * DAY;
}

/**
 * A checklist paper that is on file but too old to count: it has files, and none of them is
 * current. A paper with no file is plainly missing, not too old.
 */
export function isTooOld(
  receivedAt: readonly Date[],
  maxAgeDays: number | null | undefined,
  now: Date,
): boolean {
  return receivedAt.length > 0 && !receivedAt.some((at) => isCurrentPaper(at, maxAgeDays, now));
}
