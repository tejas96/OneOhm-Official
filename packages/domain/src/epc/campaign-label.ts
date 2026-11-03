/** What is known about where a lead came from (every part may be missing). */
export interface CampaignParts {
  readonly campaignCode?: string | null;
  /** The code's name from the Ad and campaign codes list, when the code is on it. */
  readonly campaignName?: string | null;
  readonly adId?: string | null;
  readonly adHeadline?: string | null;
  readonly utmCampaign?: string | null;
}

/**
 * The ad or campaign in words, the same on the lead page and in the "By campaign" report:
 * the campaign's name, else its code, else the ad's headline (or "ad <id>"), else the UTM
 * campaign. Null when the lead has none of these.
 */
export function campaignLabel(parts: CampaignParts): string | null {
  if (parts.campaignCode) return parts.campaignName ?? parts.campaignCode;
  if (parts.adId) return parts.adHeadline ?? `ad ${parts.adId}`;
  if (parts.adHeadline) return parts.adHeadline;
  return parts.utmCampaign ?? null;
}
