import type { AdProvider } from './campaign-rules';

/** The smallest daily budget a platform gets: below it Meta and Google barely show an ad. */
export const MIN_DAILY_BUDGET_PAISE = 10_000;

/**
 * The daily budget shared equally between the paid platforms, in whole rupees (the first
 * platform takes any odd rupee). Empty when no platform is paid.
 */
export function splitBudget(
  totalPaise: number,
  providers: readonly AdProvider[],
): Partial<Record<AdProvider, number>> {
  if (providers.length === 0) return {};
  const rupees = Math.floor(totalPaise / 100);
  const share = Math.floor(rupees / providers.length);
  const odd = rupees - share * providers.length;
  return Object.fromEntries(
    providers.map((provider, index) => [provider, (share + (index === 0 ? odd : 0)) * 100]),
  );
}

/** Why a daily budget cannot work, or null when it can. */
export function budgetProblem(totalPaise: number, providers: readonly AdProvider[]): string | null {
  if (providers.length === 0) return null;
  const least = MIN_DAILY_BUDGET_PAISE * providers.length;
  if (!Number.isInteger(totalPaise) || totalPaise < least) {
    const rupees = least / 100;
    return providers.length > 1
      ? `Use at least ₹${rupees} a day: ₹${MIN_DAILY_BUDGET_PAISE / 100} for each place.`
      : `Use at least ₹${rupees} a day.`;
  }
  return null;
}

/** Cost per lead or per sale in paise, or null when there is nothing to divide by. */
export function costPer(spentPaise: number, count: number): number | null {
  return count > 0 ? Math.round(spentPaise / count) : null;
}

/** Return on ad spend: rupees of sales for each rupee spent, to one decimal; null with no spend. */
export function returnOnSpend(salesPaise: number, spentPaise: number): number | null {
  return spentPaise > 0 ? Math.round((salesPaise / spentPaise) * 10) / 10 : null;
}
