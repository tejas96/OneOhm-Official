import { createHash } from 'node:crypto';
import {
  type DatabaseExecutor,
  marketingAds,
  marketingCampaigns,
  marketingPlacements,
} from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { AdPlatform, SpendRow } from '../types';

/** A steady 0..1 number from a text, so practice spend is the same on every read. */
const steady = (text: string) =>
  Number.parseInt(createHash('sha256').update(text).digest('hex').slice(0, 8), 16) / 0xffffffff;

const DAY_MS = 86_400_000;

/** Every day from `since` to `until` (YYYY-MM-DD, both included). */
function daysBetween(since: string, until: string): string[] {
  const days: string[] = [];
  for (
    let at = Date.parse(`${since}T00:00:00Z`);
    at <= Date.parse(`${until}T00:00:00Z`);
    at += DAY_MS
  )
    days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/**
 * The practice platform (MARKETING_MODE=sandbox, development only). It answers like Meta or
 * Google, but nothing leaves OneOhm: ads pass review on the first check and spend a steady
 * 60-95% of their daily budget on each live day, so the cards, alerts and reports fill in.
 */
export function createSandboxPlatform(provider: AdProvider, db: DatabaseExecutor): AdPlatform {
  return {
    provider,
    async launch(input, saveIds) {
      const ids = {
        campaign: `sbx-${provider}-cmp-${input.code}`,
        adSet: `sbx-${provider}-set-${input.code}`,
        ad: `sbx-${provider}-ad-${input.code}`,
      };
      await saveIds(ids);
      return {
        externalId: ids.campaign,
        externalIds: ids,
        ads: [{ externalId: ids.ad, name: `${input.code} · ${input.headline}` }],
        state: 'in_review',
        notes: [],
      };
    },
    async setState() {},
    async adStatuses(adIds) {
      return adIds.map((externalId) => ({
        externalId,
        status: 'ACTIVE',
        inReview: false,
        rejected: false,
        reason: null,
      }));
    },
    async spend(range) {
      const ads = await db
        .select({
          externalId: marketingAds.externalId,
          campaignExternalId: marketingPlacements.externalId,
          budget: marketingPlacements.dailyBudgetPaise,
          state: marketingPlacements.state,
          launchedAt: marketingCampaigns.launchedAt,
          stoppedAt: marketingCampaigns.stoppedAt,
        })
        .from(marketingAds)
        .innerJoin(marketingCampaigns, eq(marketingCampaigns.id, marketingAds.campaignId))
        .innerJoin(
          marketingPlacements,
          and(
            eq(marketingPlacements.campaignId, marketingAds.campaignId),
            eq(marketingPlacements.provider, provider),
          ),
        )
        .where(eq(marketingAds.provider, provider));
      const rows: SpendRow[] = [];
      for (const ad of ads) {
        if (!ad.launchedAt || ad.state === 'paused' || !ad.campaignExternalId) continue;
        const first = ad.launchedAt.toISOString().slice(0, 10);
        const last = ad.stoppedAt?.toISOString().slice(0, 10) ?? range.until;
        for (const day of daysBetween(range.since, range.until)) {
          if (day < first || day > last) continue;
          const spendPaise =
            Math.round((ad.budget * (0.6 + 0.35 * steady(`${ad.externalId}:${day}`))) / 100) * 100;
          const impressions = Math.round(spendPaise / 8);
          rows.push({
            externalId: ad.externalId,
            campaignExternalId: ad.campaignExternalId,
            day,
            spendPaise,
            impressions,
            clicks: Math.round(impressions * 0.03),
          });
        }
      }
      return rows;
    },
    async balance() {
      return {
        balancePaise: 250_000,
        currency: 'INR',
        topUpUrl:
          provider === 'meta'
            ? 'https://business.facebook.com/billing_hub/payment_settings'
            : 'https://ads.google.com/aw/billing/summary',
        problem: null,
      };
    },
    async sendConversions(events) {
      return events.map((event) => ({ id: event.id, status: 'sent' as const }));
    },
    async syncAudience(change) {
      return {
        externalId: change.externalId ?? `sbx-${provider}-aud-${change.kind}`,
        status: 'ready',
      };
    },
    async ensureLookalike(_seed, existing) {
      if (provider === 'google') return { externalId: null, status: 'not_allowed' };
      return { externalId: existing ?? 'sbx-meta-aud-lookalike', status: 'ready' };
    },
  };
}
