import type { GoogleAccess, GoogleAppConfig } from '../access';
import type { AdPlatform } from '../types';
import { createGoogleAds } from './google-ads-http';
import { syncGoogleAudience } from './google-audiences';
import type { GoogleContext } from './google-context';
import { sendGoogleConversions } from './google-conversions';
import { launchGoogle } from './google-launch';
import { googleAdStatuses, googleBalance, googleSpend } from './google-reports';
import { placementCampaign, setCampaignState } from './google-state';

/** Google Ads behind the shared ad platform shape (Performance Max). */
export function createGooglePlatform(access: GoogleAccess, app: GoogleAppConfig): AdPlatform {
  const ctx: GoogleContext = {
    app,
    access,
    client: createGoogleAds(app, {
      refreshToken: access.refreshToken,
      loginCustomerId: access.details.loginCustomerId ?? null,
    }),
  };
  return {
    provider: 'google',
    launch: (input, saveIds) => launchGoogle(ctx, input, saveIds),
    setState: (placement, state) => setCampaignState(ctx, placementCampaign(placement), state),
    adStatuses: (ids) => googleAdStatuses(ctx, ids),
    spend: (range) => googleSpend(ctx, range),
    balance: () => googleBalance(ctx),
    sendConversions: (events) => sendGoogleConversions(ctx, events),
    syncAudience: (change) => syncGoogleAudience(ctx, change),
    // Performance Max finds similar people itself.
    ensureLookalike: async () => ({ externalId: null, status: 'ready' }),
  };
}
