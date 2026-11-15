/** The ad platforms a business connects once (Instagram, Facebook and WhatsApp share Meta). */
export const AD_PROVIDERS = ['meta', 'google'] as const;
export type AdProvider = (typeof AD_PROVIDERS)[number];

/** What the campaign is for: chats on WhatsApp, a lead form, or a plain post. */
export const CAMPAIGN_GOALS = ['chats', 'lead_form', 'post'] as const;
export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number];

/** Where a campaign runs. WhatsApp means a message to the business's own contacts. */
export const CAMPAIGN_CHANNELS = ['instagram', 'facebook', 'google', 'whatsapp'] as const;
export type CampaignChannel = (typeof CAMPAIGN_CHANNELS)[number];

/** Who runs a channel: Meta for Instagram and Facebook, Google, or our own WhatsApp sender. */
export type PlacementProvider = AdProvider | 'whatsapp';

export function providerOf(channel: CampaignChannel): PlacementProvider {
  if (channel === 'instagram' || channel === 'facebook') return 'meta';
  return channel;
}

/** The places each goal can use; a post has no Google, and only Meta and WhatsApp carry it. */
export function channelsFor(goal: CampaignGoal): readonly CampaignChannel[] {
  return goal === 'post' ? ['instagram', 'facebook', 'whatsapp'] : CAMPAIGN_CHANNELS;
}

/** Instagram and Facebook first: a business on WhatsApp gets most chats from them. */
export const DEFAULT_CHANNELS: readonly CampaignChannel[] = ['instagram', 'facebook'];

/** The platforms that need a daily budget (WhatsApp messages and posts cost nothing here). */
export function paidProviders(
  goal: CampaignGoal,
  channels: readonly CampaignChannel[],
): AdProvider[] {
  if (goal === 'post') return [];
  const providers = new Set(channels.map(providerOf));
  return AD_PROVIDERS.filter((provider) => providers.has(provider));
}

/** Stored campaign states. "In review" and "Needs attention" are read from the placements. */
export const CAMPAIGN_STATES = [
  'launching',
  'live',
  'paused',
  'stopped',
  'scheduled',
  'posted',
  'failed',
] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

/** Each platform's part of a campaign. */
export const PLACEMENT_STATES = [
  'pending',
  'in_review',
  'live',
  'paused',
  'stopped',
  'scheduled',
  'posted',
  'sent',
  'failed',
] as const;
export type PlacementState = (typeof PLACEMENT_STATES)[number];

/** What the card says, in plain words. */
export const CAMPAIGN_LOOKS = [
  'starting',
  'in_review',
  'live',
  'paused',
  'stopped',
  'scheduled',
  'posted',
  'needs_attention',
] as const;
export type CampaignLook = (typeof CAMPAIGN_LOOKS)[number];

/**
 * The one status a campaign card shows. A failed place makes the whole card ask for attention
 * (unless the campaign was stopped); a place still checked by Meta or Google shows "In review".
 */
export function campaignLook(
  state: CampaignState,
  placements: readonly PlacementState[],
): CampaignLook {
  if (state === 'stopped') return 'stopped';
  if (state === 'failed' || placements.includes('failed')) return 'needs_attention';
  if (state === 'launching') return 'starting';
  if (state === 'paused') return 'paused';
  if (state === 'scheduled') return 'scheduled';
  if (state === 'posted') return 'posted';
  if (placements.includes('in_review') && !placements.includes('live')) return 'in_review';
  return 'live';
}

/** What a tap may do from each look: one clear action, never a dead button. */
export function campaignActions(state: CampaignState): {
  readonly pause: boolean;
  readonly stop: boolean;
  readonly runAgain: boolean;
} {
  return {
    pause: state === 'live',
    stop: state === 'live' || state === 'paused' || state === 'scheduled' || state === 'failed',
    runAgain: state === 'paused' || state === 'stopped' || state === 'posted' || state === 'failed',
  };
}

/** Who gets a WhatsApp campaign message among the business's own contacts. */
export const MESSAGE_SEGMENTS = ['quoted_not_won', 'lost_revisit', 'past_customers'] as const;
export type MessageSegment = (typeof MESSAGE_SEGMENTS)[number];

/** The WhatsApp template each segment is sent with (Meta-approved marketing templates). */
export const SEGMENT_TEMPLATE: Readonly<Record<MessageSegment, string>> = {
  quoted_not_won: 'offer_quote_follow_up',
  lost_revisit: 'offer_revisit',
  past_customers: 'offer_past_customer',
};

/** The days a quotation waits unanswered before its customer joins "quoted but did not buy". */
export const QUOTED_WAIT_DAYS = 7;

/** Where the ad that brought a lead ran, for the lead card. */
export type AdPlace = 'instagram' | 'facebook' | 'google' | 'whatsapp_ad';

/** The ad's place from what the lead carries; null for a lead no ad brought. */
export function adPlaceOf(lead: {
  readonly source: string;
  readonly adId: string | null;
  readonly ctwaClid: string | null;
  readonly gclid: string | null;
  readonly utmSource: string | null;
}): AdPlace | null {
  if (lead.source === 'instagram' || lead.source === 'facebook') return lead.source;
  if (lead.source === 'google' || lead.gclid) return 'google';
  if (lead.ctwaClid || (lead.source === 'whatsapp' && lead.adId)) return 'whatsapp_ad';
  const utm = lead.utmSource?.toLowerCase() ?? '';
  if (utm.includes('insta') || utm === 'ig') return 'instagram';
  if (utm.includes('facebook') || utm === 'fb' || utm === 'meta') return 'facebook';
  if (utm.includes('google')) return 'google';
  return null;
}
