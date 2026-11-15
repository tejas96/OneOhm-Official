import type { NewCampaignInput } from '@oneohm/api-contracts';
import {
  budgetProblem,
  CAMPAIGN_CHANNELS,
  type CampaignChannel,
  type CampaignGoal,
  channelsFor,
  type MessageSegment,
  paidProviders,
  providerOf,
} from '@oneohm/domain';
import { paiseFromRupeeText } from './marketing-words';

/** Everything the New campaign screen holds while it is filled in. */
export interface Draft {
  readonly goal: CampaignGoal;
  readonly mediaId: string | null;
  readonly mediaKind: 'image' | 'video' | null;
  readonly uploading: boolean;
  readonly text: string;
  readonly channels: readonly CampaignChannel[];
  readonly segments: readonly MessageSegment[];
  readonly city: string;
  /** Typed rupees, as text ("500"). */
  readonly budget: string;
  readonly when: 'now' | 'later';
  readonly date: string;
  readonly time: string;
}

export type LaunchProblem =
  | { readonly kind: 'uploading' }
  | { readonly kind: 'noMedia' }
  | { readonly kind: 'noText' }
  | { readonly kind: 'noPlace' }
  | { readonly kind: 'googleVideo' }
  | { readonly kind: 'whatsappVideo' }
  | { readonly kind: 'noSegment' }
  | { readonly kind: 'noCity' }
  | { readonly kind: 'budget'; readonly words: string }
  | { readonly kind: 'noDay' }
  | { readonly kind: 'pastDay' };

/** Whether a goal's budget matters: only when a paid platform is picked. */
export function needsBudget(draft: Pick<Draft, 'goal' | 'channels'>): boolean {
  return paidProviders(draft.goal, draft.channels).length > 0;
}

/** The places a goal allows, in the order shown (a post has no Google). */
export function placesFor(goal: CampaignGoal): readonly CampaignChannel[] {
  const allowed = channelsFor(goal);
  return CAMPAIGN_CHANNELS.filter((channel) => allowed.includes(channel));
}

/** Places that need a photo: Google ads, and WhatsApp offers (approved with a photo on top). */
export const NEEDS_PHOTO: readonly CampaignChannel[] = ['google', 'whatsapp'];

/** Keeps only the places the goal allows, and none that need a photo for a video. */
export function tidyChannels(
  goal: CampaignGoal,
  channels: readonly CampaignChannel[],
  mediaKind: 'image' | 'video' | null,
): CampaignChannel[] {
  const allowed = channelsFor(goal);
  return channels.filter(
    (channel) =>
      allowed.includes(channel) && !(NEEDS_PHOTO.includes(channel) && mediaKind === 'video'),
  );
}

/** The moment a "Pick a day" post goes out, as an ISO instant; null when not a real time. */
export function startsAtOf(date: string, time: string): string | null {
  if (!date || !time) return null;
  const moment = new Date(`${date}T${time}`);
  return Number.isNaN(moment.getTime()) ? null : moment.toISOString();
}

/** The first thing missing before Launch works, in the order the screen asks; null when ready. */
export function launchProblem(draft: Draft, now: Date): LaunchProblem | null {
  if (draft.uploading) return { kind: 'uploading' };
  if (!draft.mediaId) return { kind: 'noMedia' };
  if (draft.text.trim().length < 3) return { kind: 'noText' };
  if (draft.channels.length === 0) return { kind: 'noPlace' };
  if (draft.channels.includes('google') && draft.mediaKind === 'video')
    return { kind: 'googleVideo' };
  if (draft.channels.includes('whatsapp') && draft.mediaKind === 'video')
    return { kind: 'whatsappVideo' };
  if (draft.channels.includes('whatsapp') && draft.segments.length === 0)
    return { kind: 'noSegment' };
  if (draft.goal !== 'post') {
    if (draft.city.trim().length < 2) return { kind: 'noCity' };
    const words = budgetProblem(
      paiseFromRupeeText(draft.budget),
      paidProviders(draft.goal, draft.channels),
    );
    if (words) return { kind: 'budget', words };
  } else if (draft.when === 'later') {
    const at = startsAtOf(draft.date, draft.time);
    if (!at) return { kind: 'noDay' };
    if (new Date(at).getTime() <= now.getTime()) return { kind: 'pastDay' };
  }
  return null;
}

/** The request body for a ready draft. */
export function toInput(draft: Draft): NewCampaignInput {
  const post = draft.goal === 'post';
  const paid = needsBudget(draft);
  return {
    goal: draft.goal,
    text: draft.text.trim(),
    mediaId: draft.mediaId ?? '',
    channels: [...draft.channels],
    city: post ? (draft.city.trim().length >= 2 ? draft.city.trim() : 'India') : draft.city.trim(),
    dailyBudgetPaise: paid ? paiseFromRupeeText(draft.budget) : 0,
    segments: draft.channels.includes('whatsapp') ? [...draft.segments] : [],
    startsAt: post && draft.when === 'later' ? startsAtOf(draft.date, draft.time) : null,
  };
}

/** Whether a place needs the Meta connection, the Google one, or neither. */
export function connectionFor(channel: CampaignChannel): 'meta' | 'google' | null {
  const provider = providerOf(channel);
  return provider === 'whatsapp' ? null : provider;
}
