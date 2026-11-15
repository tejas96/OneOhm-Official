import type { NewCampaignInput } from '@oneohm/api-contracts';
import { budgetProblem, channelsFor, paidProviders } from '@oneohm/domain';

const DAY_MS = 24 * 3600 * 1000;
export const MAX_DAYS_AHEAD = 60;

const PLACE_NAME = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  google: 'Google',
  whatsapp: 'WhatsApp messages',
} as const;

/** One problem with the new campaign, in plain words, and the field it belongs to. */
export interface LaunchProblem {
  readonly field: 'channels' | 'dailyBudgetPaise' | 'mediaId' | 'segments' | 'startsAt';
  readonly message: string;
}

/** Google ads and WhatsApp messages both need a photo. */
function photoProblem(
  channels: readonly string[],
  mediaKind: 'image' | 'video',
): LaunchProblem | null {
  if (mediaKind === 'image') return null;
  if (channels.includes('google')) {
    return {
      field: 'channels',
      message: 'Google ads need a photo. Add a photo or take Google off.',
    };
  }
  if (channels.includes('whatsapp')) {
    return {
      field: 'channels',
      message: 'WhatsApp messages need a photo. Use a photo, or leave WhatsApp off.',
    };
  }
  return null;
}

/**
 * Why the campaign cannot start, or null. `mediaKind` is what the chosen file is (null when it
 * was not found).
 */
export function launchProblem(
  input: Pick<NewCampaignInput, 'goal' | 'channels' | 'dailyBudgetPaise' | 'segments' | 'startsAt'>,
  mediaKind: 'image' | 'video' | null,
  now: Date,
): LaunchProblem | null {
  if (!mediaKind) {
    return { field: 'mediaId', message: 'We could not find that photo. Please add it again.' };
  }
  const allowed = channelsFor(input.goal);
  const refused = input.channels.find((channel) => !allowed.includes(channel));
  if (refused) {
    return {
      field: 'channels',
      message:
        input.goal === 'post'
          ? `${PLACE_NAME[refused]} cannot be used for a post. Pick Instagram, Facebook or WhatsApp.`
          : `${PLACE_NAME[refused]} cannot be used here.`,
    };
  }
  const photo = photoProblem(input.channels, mediaKind);
  if (photo) return photo;
  const budget = budgetProblem(input.dailyBudgetPaise, paidProviders(input.goal, input.channels));
  if (budget) return { field: 'dailyBudgetPaise', message: budget };
  if (input.channels.includes('whatsapp') && input.segments.length === 0) {
    return { field: 'segments', message: 'Pick who should get the WhatsApp message.' };
  }
  if (input.startsAt) {
    if (input.goal !== 'post') {
      return { field: 'startsAt', message: 'Only a post can be set for a later day.' };
    }
    const at = Date.parse(input.startsAt);
    if (Number.isNaN(at) || at <= now.getTime()) {
      return { field: 'startsAt', message: 'Pick a time in the future.' };
    }
    if (at > now.getTime() + MAX_DAYS_AHEAD * DAY_MS) {
      return { field: 'startsAt', message: `Pick a day within the next ${MAX_DAYS_AHEAD} days.` };
    }
  }
  return null;
}
