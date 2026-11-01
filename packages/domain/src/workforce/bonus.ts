/**
 * Project bonuses and incentives (PRD 3.12, 4.7). A bonus has a total in paise, shared
 * between people by whole-number shares; approved, each share is money owed to that
 * employee, paid through finance like any other bill.
 */
export interface BonusShare {
  readonly userId: string;
  readonly shares: number;
}

/** Largest a single bonus may be: ₹5,00,000, so a typo cannot create a huge payable. */
export const MAX_BONUS_PAISE = 50_000_000;

export type BonusProblem = 'amount' | 'nobody' | 'shares' | 'duplicate' | 'too_small';

export function checkBonus(input: {
  readonly totalPaise: number;
  readonly people: readonly BonusShare[];
}): BonusProblem | null {
  if (!Number.isInteger(input.totalPaise) || input.totalPaise <= 0) return 'amount';
  if (input.totalPaise > MAX_BONUS_PAISE) return 'amount';
  if (input.people.length === 0) return 'nobody';
  if (input.people.some((person) => !Number.isInteger(person.shares) || person.shares < 1))
    return 'shares';
  if (new Set(input.people.map((person) => person.userId)).size !== input.people.length)
    return 'duplicate';
  // Every person gets at least one rupee.
  if (input.totalPaise < input.people.length * 100) return 'too_small';
  return null;
}

/**
 * Each person's amount in whole rupees (paise multiples of 100), by shares. Rupees left
 * over after rounding down go one at a time to the largest remainders, then the first
 * listed, so the amounts always add up to the total exactly (any odd paise go first).
 */
export function splitBonus(
  totalPaise: number,
  people: readonly BonusShare[],
): { readonly userId: string; readonly amountPaise: number }[] {
  const totalShares = people.reduce((sum, person) => sum + person.shares, 0);
  if (totalShares <= 0) return [];
  const rupees = Math.floor(totalPaise / 100);
  const odd = totalPaise - rupees * 100;
  const exact = people.map((person) => (rupees * person.shares) / totalShares);
  const amounts = exact.map((value) => Math.floor(value));
  let left = rupees - amounts.reduce((sum, value) => sum + value, 0);
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    amounts[index] = (amounts[index] ?? 0) + 1;
    left -= 1;
  }
  return people.map((person, index) => ({
    userId: person.userId,
    amountPaise: (amounts[index] ?? 0) * 100 + (index === 0 ? odd : 0),
  }));
}
