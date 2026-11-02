/** Below this share a part needs the owner's attention. */
const GOOD = 0.8;

/**
 * The one thing to look at for a person this month: the lowest of their rates when it is
 * under 80%; nothing when all are good or nothing was judged.
 */
export function weakSpot(row: {
  readonly tasksJudged: number;
  readonly onTimeRate: number | null;
  readonly firstTimeRate: number | null;
}): { readonly part: 'onTime' | 'firstTime'; readonly rate: number } | null {
  if (row.tasksJudged === 0) return null;
  const parts = [
    { part: 'onTime' as const, rate: row.onTimeRate },
    { part: 'firstTime' as const, rate: row.firstTimeRate },
  ].filter((entry): entry is { part: 'onTime' | 'firstTime'; rate: number } => entry.rate !== null);
  const lowest = parts.sort((a, b) => a.rate - b.rate)[0];
  return lowest && lowest.rate < GOOD ? lowest : null;
}
