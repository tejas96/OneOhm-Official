import type { CampaignDetail } from '@oneohm/api-contracts';
import {
  type CampaignChannel,
  type CampaignGoal,
  type PlacementProvider,
  paidProviders,
  providerOf,
} from '@oneohm/domain';

export type SendStep = 'review' | 'post' | 'messages';

/** What the third step says: ads go for review, a post goes up, WhatsApp-only just sends. */
export function sendStepOf(goal: CampaignGoal, channels: readonly CampaignChannel[]): SendStep {
  if (goal === 'post') return 'post';
  return paidProviders(goal, channels).length > 0 ? 'review' : 'messages';
}

/** The platforms a campaign reaches, once each, in a fixed order. */
export function providersOf(channels: readonly CampaignChannel[]): PlacementProvider[] {
  const seen = new Set(channels.map(providerOf));
  return (['meta', 'google', 'whatsapp'] as const).filter((provider) => seen.has(provider));
}

export type LaunchOutcome = 'all_good' | 'some_failed' | 'all_failed';

/** How the launch really went, read from each place's state; never assumed. */
export function launchOutcome(detail: Pick<CampaignDetail, 'placements'>): LaunchOutcome {
  const failed = detail.placements.filter((place) => place.state === 'failed').length;
  if (failed === 0) return 'all_good';
  return failed === detail.placements.length ? 'all_failed' : 'some_failed';
}

/** Which step the walk-through shows while the server works: one every `stepMs`, never the last. */
export function stepShown(elapsedMs: number, stepCount: number, stepMs = 900): number {
  return Math.min(Math.floor(elapsedMs / stepMs) + 1, stepCount - 1);
}
