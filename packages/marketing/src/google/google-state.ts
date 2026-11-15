import type { PlatformIds, PlatformState } from '../types';
import { campaignResource, type GoogleContext, lastId } from './google-context';

/**
 * Turns the campaign on or off. Stopped is paused: never removed. Only the campaign is touched,
 * so an asset group that was removed never blocks a pause.
 */
export async function setCampaignState(
  ctx: GoogleContext,
  campaign: string,
  state: PlatformState,
): Promise<void> {
  const status = state === 'active' ? 'ENABLED' : 'PAUSED';
  await ctx.client.mutate(ctx.access.customerId, 'googleAds:mutate', {
    mutateOperations: [
      {
        campaignOperation: {
          update: { resourceName: campaignResource(ctx, campaign), status },
          updateMask: 'status',
        },
      },
    ],
  });
}

/**
 * Switches the campaign on. When that fails, reads it back: if Google did turn it on, pauses
 * it (best effort) so nothing runs that we did not confirm, then throws the first error.
 */
export async function enableCampaign(ctx: GoogleContext, campaign: string): Promise<void> {
  try {
    await setCampaignState(ctx, campaign, 'active');
  } catch (error) {
    try {
      const [row] = await ctx.client.search(
        ctx.access.customerId,
        `SELECT campaign.status FROM campaign WHERE campaign.id = ${lastId(campaign)}`,
      );
      if (row?.campaign?.status === 'ENABLED') await setCampaignState(ctx, campaign, 'paused');
    } catch {
      // Best effort: the first error is the one to show.
    }
    throw error;
  }
}

/** The campaign on Google a placement stands for. */
export function placementCampaign(placement: {
  readonly externalId: string;
  readonly externalIds: PlatformIds;
}): string {
  return placement.externalIds.campaign ?? placement.externalId;
}
