import { marketingAds, marketingPlacements, marketingSpendDays } from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { MarketingDeps } from './deps';
import { forEachPlatform } from './providers';

/** Pulls the last 7 days of spend from each platform and saves it per ad and day. */
export async function pullSpend(deps: MarketingDeps, now: Date): Promise<number | null> {
  const { db, config, timeZone } = deps;
  const pace = { key: 'spend', cadence: 'hourly', timeZone, now } as const;
  const until = todayIn(timeZone, now);
  return forEachPlatform(
    db,
    config,
    async (platform, provider: AdProvider) => {
      const rows = await platform.spend({ since: addDays(until, -7), until });
      if (rows.length === 0) return 0;
      const ads = await db
        .select({ id: marketingAds.externalId, campaignId: marketingAds.campaignId })
        .from(marketingAds)
        .where(
          and(
            eq(marketingAds.provider, provider),
            inArray(marketingAds.externalId, [...new Set(rows.map((row) => row.externalId))]),
          ),
        );
      const campaigns = await db
        .select({ id: marketingPlacements.externalId, campaignId: marketingPlacements.campaignId })
        .from(marketingPlacements)
        .where(
          and(
            eq(marketingPlacements.provider, provider),
            inArray(marketingPlacements.externalId, [
              ...new Set(rows.flatMap((row) => [row.campaignExternalId, row.externalId])),
            ]),
          ),
        );
      const byAd = new Map(ads.map((ad) => [ad.id, ad.campaignId]));
      const byCampaign = new Map(campaigns.map((place) => [place.id, place.campaignId]));
      const values = rows.map((row) => ({
        provider,
        externalId: row.externalId,
        day: row.day,
        campaignId:
          byAd.get(row.externalId) ??
          byCampaign.get(row.campaignExternalId) ??
          byCampaign.get(row.externalId) ??
          null,
        spendPaise: row.spendPaise,
        impressions: row.impressions,
        clicks: row.clicks,
      }));
      for (let at = 0; at < values.length; at += 500)
        await db
          .insert(marketingSpendDays)
          .values(values.slice(at, at + 500))
          .onConflictDoUpdate({
            target: [
              marketingSpendDays.provider,
              marketingSpendDays.externalId,
              marketingSpendDays.day,
            ],
            set: {
              campaignId: sql`excluded.campaign_id`,
              spendPaise: sql`excluded.spend_paise`,
              impressions: sql`excluded.impressions`,
              clicks: sql`excluded.clicks`,
              updatedAt: new Date(),
            },
          });
      return values.length;
    },
    pace,
  );
}
