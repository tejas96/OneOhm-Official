import {
  type Database,
  marketingAds,
  marketingCampaigns,
  marketingPlacements,
} from '@oneohm/database';
import type { AdProvider } from '@oneohm/domain';
import type { AdStatus } from '@oneohm/marketing';
import { and, eq, inArray } from 'drizzle-orm';
import { alertMarketing, providerName } from './alerts';
import type { MarketingDeps } from './deps';
import { forEachPlatform } from './providers';

/** What the platform's answers mean for one placement. */
export function placementVerdict(
  state: 'in_review' | 'live',
  statuses: readonly AdStatus[],
): { readonly state: 'in_review' | 'live' | 'failed'; readonly reason: string | null } {
  const rejected = statuses.find((status) => status.rejected);
  if (rejected)
    return { state: 'failed', reason: rejected.reason ?? 'The platform did not say why.' };
  if (statuses.length > 0 && !statuses.some((status) => status.inReview))
    return { state: 'live', reason: null };
  return { state, reason: null };
}

/**
 * Asks Meta and Google where ads waiting for review stand (live ones too, when `withLive`).
 * Approved placements go live; a rejected ad fails its placement and tells the team once.
 */
export async function checkAdStatuses(
  deps: MarketingDeps,
  withLive: boolean,
): Promise<number | null> {
  const { db, config } = deps;
  return forEachPlatform(db, config, async (platform, provider) => {
    const placements = await db
      .select()
      .from(marketingPlacements)
      .where(
        and(
          eq(marketingPlacements.provider, provider),
          inArray(marketingPlacements.state, withLive ? ['in_review', 'live'] : ['in_review']),
        ),
      );
    if (placements.length === 0) return 0;
    const ads = await db
      .select()
      .from(marketingAds)
      .where(
        and(
          eq(marketingAds.provider, provider),
          inArray(
            marketingAds.campaignId,
            placements.map((placement) => placement.campaignId),
          ),
        ),
      );
    if (ads.length === 0) return 0;
    const statuses = new Map(
      (await platform.adStatuses(ads.map((ad) => ad.externalId))).map((s) => [s.externalId, s]),
    );
    let changed = 0;
    for (const ad of ads) {
      const status = statuses.get(ad.externalId);
      if (status && status.status !== ad.reviewStatus)
        await db
          .update(marketingAds)
          .set({ reviewStatus: status.status })
          .where(
            and(eq(marketingAds.provider, provider), eq(marketingAds.externalId, ad.externalId)),
          );
      if (status?.rejected) await tellRejected(db, provider, ad, status);
    }
    for (const placement of placements) {
      const mine = ads.flatMap((ad) =>
        ad.campaignId === placement.campaignId && statuses.has(ad.externalId)
          ? [statuses.get(ad.externalId) as AdStatus]
          : [],
      );
      const verdict = placementVerdict(placement.state as 'in_review' | 'live', mine);
      if (verdict.state === placement.state) continue;
      await db
        .update(marketingPlacements)
        .set({ state: verdict.state, lastError: verdict.reason, updatedAt: new Date() })
        .where(eq(marketingPlacements.id, placement.id));
      changed += 1;
    }
    return changed;
  });
}

async function tellRejected(
  db: Database,
  provider: AdProvider,
  ad: typeof marketingAds.$inferSelect,
  status: AdStatus,
): Promise<void> {
  const [campaign] = await db
    .select({ name: marketingCampaigns.name, creator: marketingCampaigns.createdByUserId })
    .from(marketingCampaigns)
    .where(eq(marketingCampaigns.id, ad.campaignId));
  const who = providerName(provider);
  await alertMarketing(
    db,
    {
      kind: 'marketing_rejected',
      title: `${who} did not approve an ad`,
      body: `"${ad.name}" in ${campaign?.name ?? 'a campaign'} was not approved. ${status.reason ?? `${who} did not say why.`} Change the photo or words and try again.`,
      dedupeKey: `mkt_rejected:${ad.externalId}`,
      subject: { type: 'marketing', id: ad.campaignId },
    },
    campaign?.creator ?? null,
  );
}
