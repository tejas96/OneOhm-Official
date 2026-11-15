import { PlatformError } from '../errors';
import type { AdStatus, Balance, SpendRow } from '../types';
import { type GoogleContext, isRupees, NOT_RUPEES } from './google-context';

const paise = (micros: unknown) => Math.round(Number(micros ?? 0) / 10_000);

const REASON_WORDS: Readonly<Record<string, string>> = {
  CAMPAIGN_PENDING: 'Google is checking the ad.',
  MOST_ASSET_GROUPS_UNDER_REVIEW: 'Google is checking the ad.',
  HAS_ASSET_GROUPS_DISAPPROVED:
    'Google did not approve the photo or text. Change them and run again.',
  HAS_ADS_DISAPPROVED: 'Google did not approve the photo or text. Change them and run again.',
  HAS_ASSET_GROUPS_LIMITED_BY_POLICY: 'Google approved only part of the ad.',
  HAS_ADS_LIMITED_BY_POLICY: 'Google approved only part of the ad.',
  CAMPAIGN_PAUSED: 'The campaign is paused.',
  BUDGET_CONSTRAINED: 'The daily budget is the limit.',
  NO_ASSET_GROUPS: 'Google has no ad to show yet.',
  ASSET_GROUPS_PAUSED: 'The ad is paused.',
};

const plain = (reason: string) =>
  REASON_WORDS[reason] ?? `Google says: ${reason.toLowerCase().replace(/_/g, ' ')}.`;

/** Review state per campaign (Performance Max has no separate ads, the campaign stands for it). */
export async function googleAdStatuses(
  ctx: GoogleContext,
  adIds: readonly string[],
): Promise<AdStatus[]> {
  const ids = adIds.filter((id) => /^\d+$/.test(id));
  if (ids.length === 0) return [];
  const rows = await ctx.client.search(
    ctx.access.customerId,
    `SELECT campaign.id, campaign.status, campaign.primary_status, campaign.primary_status_reasons FROM campaign WHERE campaign.id IN (${ids.join(', ')})`,
  );
  return rows.map((row) => {
    const campaign = row.campaign ?? {};
    const reasons = (campaign.primaryStatusReasons ?? []) as string[];
    const primary = String(campaign.primaryStatus ?? '');
    const inReview = primary === 'PENDING' || reasons.some((r) => /UNDER_REVIEW|PENDING/.test(r));
    const rejectedWhy = reasons.find((r) => /DISAPPROV|POLICY/.test(r));
    const rejected = primary === 'NOT_ELIGIBLE' && rejectedWhy !== undefined;
    const reason = rejected ? plain(rejectedWhy as string) : null;
    return {
      externalId: String(campaign.id),
      status: primary || String(campaign.status ?? ''),
      inReview,
      rejected,
      reason,
    };
  });
}

/** Spend, views and clicks per campaign per day, in paise. */
export async function googleSpend(
  ctx: GoogleContext,
  range: { readonly since: string; readonly until: string },
): Promise<SpendRow[]> {
  // Budgets and costs here are rupees: a rows-in-another-currency account would be misread.
  if (!isRupees(ctx)) return [];
  const rows = await ctx.client.search(
    ctx.access.customerId,
    `SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks FROM campaign WHERE segments.date BETWEEN '${range.since}' AND '${range.until}' AND campaign.status != 'REMOVED'`,
  );
  return rows.map((row) => ({
    externalId: String(row.campaign?.id),
    campaignExternalId: String(row.campaign?.id),
    day: String(row.segments?.date),
    spendPaise: paise(row.metrics?.costMicros),
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
  }));
}

const TOP_UP_URL = 'https://ads.google.com/aw/billing/summary';

const PROBLEMS: Readonly<Record<string, string>> = {
  SUSPENDED: 'Google has suspended the ad account. Open Google Ads to fix it.',
  CANCELED: 'The Google Ads account is cancelled. Open Google Ads to fix it.',
  CLOSED: 'The Google Ads account is closed. Open Google Ads to fix it.',
};

/** Google's account-time text "2026-11-01 00:00:00" as a moment (India time). */
const moment = (value: unknown): number | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  const parsed = new Date(`${text.replace(' ', 'T')}+05:30`).getTime();
  return Number.isNaN(parsed) ? null : parsed;
};

/** An approved budget that has started and has not ended. */
function isRunning(budget: Record<string, unknown>, now: number): boolean {
  const start = moment(budget.approvedStartDateTime);
  const end = budget.approvedEndTimeType === 'FOREVER' ? null : moment(budget.approvedEndDateTime);
  return (start === null || start <= now) && (end === null || end > now);
}

/** Account health and, when there is a spending limit, the money left. */
export async function googleBalance(ctx: GoogleContext): Promise<Balance | null> {
  const customer = ctx.access.customerId;
  if (!isRupees(ctx)) {
    return {
      balancePaise: null,
      currency: ctx.access.currency,
      topUpUrl: TOP_UP_URL,
      problem: NOT_RUPEES,
    };
  }
  const [account] = await ctx.client.search(customer, 'SELECT customer.status FROM customer');
  const problem = PROBLEMS[String(account?.customer?.status ?? '')] ?? null;
  let balancePaise: number | null = null;
  try {
    const budgets = await ctx.client.search(
      customer,
      "SELECT account_budget.approved_start_date_time, account_budget.approved_end_date_time, account_budget.approved_end_time_type, account_budget.approved_spending_limit_micros, account_budget.adjusted_spending_limit_micros, account_budget.amount_served_micros FROM account_budget WHERE account_budget.status = 'APPROVED'",
    );
    const now = Date.now();
    const limitOf = (budget: Record<string, unknown>): number =>
      Number(budget.adjustedSpendingLimitMicros ?? budget.approvedSpendingLimitMicros ?? 0);
    const running = budgets
      .map((row) => (row.accountBudget ?? {}) as Record<string, unknown>)
      .filter((budget) => isRunning(budget, now) && limitOf(budget) > 0);
    if (running.length > 0) {
      const served = running.reduce(
        (sum, budget) => sum + Number(budget.amountServedMicros ?? 0),
        0,
      );
      const limit = running.reduce((sum, budget) => sum + limitOf(budget), 0);
      balancePaise = Math.max(0, paise(limit - served));
    }
  } catch (error) {
    if (error instanceof PlatformError && (error.kind === 'auth' || error.retryable)) throw error;
  }
  return {
    balancePaise,
    currency: ctx.access.currency,
    topUpUrl: TOP_UP_URL,
    problem,
  };
}
