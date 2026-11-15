import { PlatformError, saveConnection } from '@oneohm/marketing';
import type { CampaignContext } from './campaign-context';

export const PLATFORM_NAME = { meta: 'Meta', google: 'Google' } as const;

/** The plain words when an ad account is not in rupees; null when it is (or is not known). */
export function currencyWords(
  provider: 'meta' | 'google',
  currency: string | null | undefined,
): string | null {
  if (!currency || currency.toUpperCase() === 'INR') return null;
  return `OneOhm runs ads in rupees. Your ${PLATFORM_NAME[provider]} account is set to ${currency}. Pick an ad account set to INR.`;
}

/**
 * The id a platform's setState takes: the saved id, else the campaign id. A Google resource name
 * ("customers/1/campaigns/2") is cut down to its last part. Null when nothing was ever made.
 */
export function platformIdOf(place: {
  readonly externalId: string | null;
  readonly externalIds: unknown;
}): string | null {
  const ids = (place.externalIds ?? {}) as Record<string, string | undefined>;
  const id = place.externalId || ids.campaign || null;
  return id ? (id.split('/').pop() ?? id) : null;
}

/** A refused sign-in on a platform call: the connection asks to be connected again. */
export async function noteAuthFailure(
  ctx: CampaignContext,
  provider: 'meta' | 'google',
  error: unknown,
): Promise<void> {
  if (!(error instanceof PlatformError) || error.kind !== 'auth') return;
  await saveConnection(ctx.db, ctx.config.secretKey, provider, {
    status: 'needs_attention',
    lastError: error.message,
  });
}
