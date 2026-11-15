import { marketingCampaigns, marketingPlacements } from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import type { CampaignRow, PlacementRow } from './campaign-card';
import type { CampaignContext } from './campaign-context';

/**
 * Takes a place for this launch in one statement: it only works while the place is still in a
 * startable state, so a double click (or two runners) makes one platform campaign. Returns the
 * place, or null when someone else already has it.
 */
export async function claimPlacement(
  ctx: CampaignContext,
  id: string,
  startable: readonly PlacementRow['state'][],
): Promise<PlacementRow | null> {
  const [row] = await ctx.db
    .update(marketingPlacements)
    .set({ state: 'pending', lastError: null, updatedAt: new Date() })
    .where(and(eq(marketingPlacements.id, id), inArray(marketingPlacements.state, [...startable])))
    .returning();
  return row ?? null;
}

/**
 * Moves the campaign into `launching` only from one of the given states. Returns false when it
 * was in another state (someone else is launching it).
 */
export async function claimCampaign(
  ctx: CampaignContext,
  id: string,
  from: readonly CampaignRow['state'][],
): Promise<boolean> {
  const rows = await ctx.db
    .update(marketingCampaigns)
    .set({ state: 'launching', updatedAt: new Date() })
    .where(and(eq(marketingCampaigns.id, id), inArray(marketingCampaigns.state, [...from])))
    .returning({ id: marketingCampaigns.id });
  return rows.length > 0;
}
