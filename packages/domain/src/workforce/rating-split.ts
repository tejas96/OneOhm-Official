export interface ManagerSpan {
  readonly userId: string;
  readonly from: Date;
  readonly to: Date | null;
}

/**
 * Shares a project's rating points between the people who managed it, by the time each
 * held it up to `at`. Whole points only: the largest remainders get the leftover points
 * (a tie goes to whoever managed first), so the shares always add up to `total`. One
 * person's separate terms count together; someone who held it for no time gets nothing.
 */
export function splitRatingPoints(
  terms: readonly ManagerSpan[],
  total: number,
  at: Date,
): { userId: string; points: number }[] {
  const ms = new Map<string, number>();
  for (const term of terms) {
    const end = Math.min((term.to ?? at).getTime(), at.getTime());
    const held = end - term.from.getTime();
    if (held > 0) ms.set(term.userId, (ms.get(term.userId) ?? 0) + held);
  }
  const people = [...ms].filter(([, held]) => held > 0);
  const all = people.reduce((sum, [, held]) => sum + held, 0);
  if (all === 0 || total <= 0) return [];
  const shares = people.map(([userId, held], order) => {
    const exact = (total * held) / all;
    const points = Math.floor(exact);
    return { userId, points, remainder: exact - points, order };
  });
  let left = total - shares.reduce((sum, share) => sum + share.points, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (const share of byRemainder) {
    if (left <= 0) break;
    share.points += 1;
    left -= 1;
  }
  return shares
    .filter((share) => share.points > 0)
    .map(({ userId, points }) => ({ userId, points }));
}
