import type { CampaignCard } from '@oneohm/api-contracts';
import type { marketingCampaigns, marketingMedia, marketingPlacements } from '@oneohm/database';
import type { CampaignChannel, PlacementState } from '@oneohm/domain';
import { campaignActions, campaignLook } from '@oneohm/domain';

export type CampaignRow = typeof marketingCampaigns.$inferSelect;
export type PlacementRow = typeof marketingPlacements.$inferSelect;
export type MediaRow = typeof marketingMedia.$inferSelect;

/** Where a photo or video is served, without `/v1` (the web adds its own prefix). */
export const mediaPath = (mediaId: string) => `/m/${mediaId}`;

/** One campaign as its card: status in plain words, what a tap may do, its numbers. */
export function toCard(
  campaign: CampaignRow,
  placements: readonly PlacementRow[],
  media: MediaRow | null,
  numbers: CampaignCard['numbers'],
): CampaignCard {
  const states: PlacementState[] = placements.map((placement) => placement.state);
  return {
    id: campaign.id,
    code: campaign.code,
    name: campaign.name,
    goal: campaign.goal,
    state: campaign.state,
    look: campaignLook(campaign.state, states),
    channels: campaign.channels as CampaignChannel[],
    city: campaign.city,
    dailyBudgetPaise: campaign.dailyBudgetPaise,
    mediaUrl: media ? mediaPath(media.id) : null,
    mediaKind: media?.kind ?? null,
    text: campaign.text,
    startsAt: campaign.startsAt?.toISOString() ?? null,
    launchedAt: campaign.launchedAt?.toISOString() ?? null,
    createdAt: campaign.createdAt.toISOString(),
    numbers,
    placements: placements.map((placement) => ({
      provider: placement.provider,
      state: placement.state,
      dailyBudgetPaise: placement.dailyBudgetPaise,
      notes: placement.notes,
      error: placement.lastError,
    })),
    actions: campaignActions(campaign.state),
  };
}
