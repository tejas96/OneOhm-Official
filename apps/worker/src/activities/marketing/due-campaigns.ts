import { brandName, type Database, marketingCampaigns } from '@oneohm/database';
import { errorDetail, plainError, publishCampaignPosts } from '@oneohm/marketing';
import { and, eq, isNotNull, lt, lte } from 'drizzle-orm';
import type { MarketingDeps } from './deps';

/** A claimed post still "launching" after this long was claimed by a worker that died. */
const STALE_LAUNCH_MS = 15 * 60_000;

export const STALE_LAUNCH_WORDS =
  'This may have posted already. Check Instagram and Facebook before running it again.';

/** Posts stuck in `launching`: never retried on their own, as they may be live already. */
async function failStaleLaunches(db: Database, now: Date): Promise<void> {
  await db
    .update(marketingCampaigns)
    .set({ state: 'failed', lastError: STALE_LAUNCH_WORDS, updatedAt: new Date() })
    .where(
      and(
        eq(marketingCampaigns.state, 'launching'),
        eq(marketingCampaigns.goal, 'post'),
        lt(marketingCampaigns.updatedAt, new Date(now.getTime() - STALE_LAUNCH_MS)),
      ),
    );
}

/**
 * Posts set for later whose time has come. Each campaign is claimed first (scheduled →
 * launching in one statement), so two runs never post it twice.
 */
export async function publishDueCampaigns(deps: MarketingDeps, now: Date): Promise<number> {
  const { db } = deps;
  await failStaleLaunches(db, now);
  const due = await db
    .select({ id: marketingCampaigns.id })
    .from(marketingCampaigns)
    .where(
      and(
        eq(marketingCampaigns.state, 'scheduled'),
        isNotNull(marketingCampaigns.startsAt),
        lte(marketingCampaigns.startsAt, now),
      ),
    );
  let published = 0;
  for (const { id } of due) {
    const claimed = await claim(db, id);
    if (!claimed) continue;
    try {
      await publishCampaignPosts(db, deps.config, id, {
        apiPublicUrl: deps.apiPublicUrl,
        businessName: await brandName(db),
      });
      published += 1;
    } catch (error) {
      console.error(`[marketing] campaign ${id} did not post: ${errorDetail(error)}`);
      await db
        .update(marketingCampaigns)
        .set({ state: 'failed', lastError: plainError(error), updatedAt: new Date() })
        .where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.state, 'launching')));
    }
  }
  return published;
}

async function claim(db: Database, id: string): Promise<boolean> {
  const rows = await db
    .update(marketingCampaigns)
    .set({ state: 'launching', updatedAt: new Date() })
    .where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.state, 'scheduled')))
    .returning({ id: marketingCampaigns.id });
  return rows.length > 0;
}
