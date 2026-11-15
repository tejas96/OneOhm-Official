import type { MetaAccess } from '../access';
import type { AdStatus, Balance, PlatformState, SpendRow } from '../types';
import { NOT_INR } from './meta-currency';
import type { Graph } from './meta-graph';

/** Switches the ad, ad set and campaign on (children first) or off (campaign first). */
export async function setMetaState(
  graph: Graph,
  placement: {
    readonly externalId: string;
    readonly externalIds: Readonly<Record<string, string>>;
  },
  state: PlatformState,
): Promise<void> {
  const { ad, adSet, campaign } = placement.externalIds;
  const campaignId = campaign ?? placement.externalId;
  const status = state === 'active' ? 'ACTIVE' : 'PAUSED';
  const order = state === 'active' ? [ad, adSet, campaignId] : [campaignId, adSet, ad];
  for (const id of order) {
    if (id) await graph.post(id, { status });
  }
}

const textsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);
  return [];
};

const IN_REVIEW = new Set(['PENDING_REVIEW', 'IN_PROCESS']);
const REJECTED = new Set(['DISAPPROVED', 'WITH_ISSUES']);

export async function metaAdStatuses(graph: Graph, adIds: readonly string[]): Promise<AdStatus[]> {
  const out: AdStatus[] = [];
  for (let i = 0; i < adIds.length; i += 50) {
    const chunk = adIds.slice(i, i + 50);
    const reply = await graph.get<
      Record<string, { effective_status?: string; ad_review_feedback?: unknown }>
    >('', { ids: chunk.join(','), fields: 'effective_status,ad_review_feedback' });
    for (const id of chunk) {
      const row = reply[id];
      if (!row) continue;
      const status = row.effective_status ?? 'UNKNOWN';
      const rejected = REJECTED.has(status);
      const billing = status === 'PENDING_BILLING_INFO';
      const why = textsOf(row.ad_review_feedback).join(' ');
      out.push({
        externalId: id,
        status,
        inReview: IN_REVIEW.has(status),
        rejected,
        reason: billing
          ? 'Add a payment method in Meta'
          : rejected
            ? why || 'Meta did not say why. Open the ad in Meta Ads Manager.'
            : null,
      });
    }
  }
  return out;
}

interface InsightRow {
  ad_id: string;
  campaign_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start: string;
}

export async function metaSpend(
  graph: Graph,
  access: MetaAccess,
  range: { readonly since: string; readonly until: string },
): Promise<SpendRow[]> {
  if (access.currency !== 'INR') return [];
  const rows = await graph.getAll<InsightRow>(`${access.adAccountId}/insights`, {
    level: 'ad',
    fields: 'ad_id,campaign_id,spend,impressions,clicks',
    time_range: { since: range.since, until: range.until },
    time_increment: 1,
    limit: 500,
  });
  return rows.map((row) => ({
    externalId: row.ad_id,
    campaignExternalId: row.campaign_id,
    day: row.date_start,
    spendPaise: Math.round(Number.parseFloat(row.spend ?? '0') * 100) || 0,
    impressions: Number.parseInt(row.impressions ?? '0', 10) || 0,
    clicks: Number.parseInt(row.clicks ?? '0', 10) || 0,
  }));
}

const PROBLEMS: Readonly<Record<number, string>> = {
  2: 'Meta has disabled this ad account. Open Meta Ads Manager to see why.',
  3: 'This ad account has an unpaid balance. Pay it in Meta to run ads again.',
  7: 'Meta is still reviewing this ad account.',
  8: 'Meta is still reviewing this ad account.',
  9: 'This ad account is in a grace period after a failed payment. Fix the payment in Meta.',
  100: 'This ad account is closed in Meta.',
  101: 'This ad account is closed in Meta.',
};

/** The rupee amount in Meta's display text ("Available balance (₹2,500.00 INR)"), sign kept; null if unclear. */
export function parseBalancePaise(display: string | undefined): number | null {
  if (!display) return null;
  const match = display.match(
    /([-−])?\s*(?:₹|Rs\.?|INR)\s*([-−])?\s*(\d[\d,]*(?:\.\d+)?)|([-−])?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:INR|₹)/i,
  );
  if (!match) return null;
  const negative = Boolean(match[1] ?? match[2] ?? match[4]);
  const number = Number.parseFloat((match[3] ?? match[5] ?? '').replace(/,/g, ''));
  if (!Number.isFinite(number)) return null;
  const paise = Math.round(number * 100);
  return negative ? -paise : paise;
}

export async function metaBalance(graph: Graph, access: MetaAccess): Promise<Balance> {
  const reply = await graph.get<{
    account_status?: number;
    currency?: string;
    is_prepay_account?: boolean;
    funding_source_details?: { display_string?: string };
  }>(access.adAccountId, {
    fields:
      'account_status,disable_reason,currency,is_prepay_account,balance,funding_source_details',
  });
  const currency = reply.currency ?? access.currency;
  const digits = access.adAccountId.replace(/\D/g, '');
  const topUpUrl = `https://business.facebook.com/billing_hub/accounts/details?asset_id=${digits}`;
  if (currency !== 'INR') return { balancePaise: null, currency, topUpUrl, problem: NOT_INR };
  return {
    balancePaise: reply.is_prepay_account
      ? parseBalancePaise(reply.funding_source_details?.display_string)
      : null,
    currency,
    topUpUrl,
    problem: PROBLEMS[reply.account_status ?? 1] ?? null,
  };
}
