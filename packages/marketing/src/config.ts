import type { GoogleAppConfig, MetaAppConfig } from './access';
import type { Fetch } from './types';

/** The marketing settings both the API and the worker read from the environment. */
export interface MarketingEnvironment {
  readonly MARKETING_MODE?: 'live' | 'sandbox' | undefined;
  readonly MARKETING_SECRET_KEY?: string | undefined;
  readonly META_APP_ID?: string | undefined;
  readonly META_APP_SECRET?: string | undefined;
  readonly WHATSAPP_APP_SECRET?: string | undefined;
  readonly META_LOGIN_CONFIG_ID?: string | undefined;
  readonly META_GRAPH_VERSION?: string | undefined;
  readonly GOOGLE_ADS_CLIENT_ID?: string | undefined;
  readonly GOOGLE_ADS_CLIENT_SECRET?: string | undefined;
  readonly GOOGLE_ADS_DEVELOPER_TOKEN?: string | undefined;
  readonly GOOGLE_ADS_API_VERSION?: string | undefined;
}

/** The development-only key; production refuses it (see the API's environment checks). */
export const LOCAL_MARKETING_KEY = 'oneohm-local-marketing-secret';

/** Marketing as configured: which mode, the encryption key, and the apps that are set up. */
export interface MarketingConfig {
  readonly mode: 'live' | 'sandbox';
  readonly secretKey: string;
  /** Null when the Meta app keys are missing: Meta shows "not connected" with what is missing. */
  readonly meta: MetaAppConfig | null;
  readonly google: GoogleAppConfig | null;
  /** Names of the settings still missing, for the honest "not connected" state. */
  readonly missing: { readonly meta: readonly string[]; readonly google: readonly string[] };
  readonly fetch: Fetch;
}

const missingOf = (env: MarketingEnvironment, keys: readonly (keyof MarketingEnvironment)[]) =>
  keys.filter((key) => !env[key]);

export function marketingConfig(
  env: MarketingEnvironment,
  fetcher: Fetch = globalThis.fetch,
): MarketingConfig {
  const appSecret = env.META_APP_SECRET ?? env.WHATSAPP_APP_SECRET;
  const metaMissing = [
    ...missingOf(env, ['META_APP_ID']),
    ...(appSecret ? [] : ['META_APP_SECRET']),
  ];
  const googleMissing = missingOf(env, [
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_DEVELOPER_TOKEN',
  ]);
  return {
    mode: env.MARKETING_MODE ?? 'live',
    secretKey: env.MARKETING_SECRET_KEY ?? LOCAL_MARKETING_KEY,
    meta:
      env.META_APP_ID && appSecret
        ? {
            appId: env.META_APP_ID,
            appSecret,
            graphVersion: env.META_GRAPH_VERSION ?? 'v26.0',
            loginConfigId: env.META_LOGIN_CONFIG_ID ?? null,
            fetch: fetcher,
          }
        : null,
    google:
      env.GOOGLE_ADS_CLIENT_ID && env.GOOGLE_ADS_CLIENT_SECRET && env.GOOGLE_ADS_DEVELOPER_TOKEN
        ? {
            clientId: env.GOOGLE_ADS_CLIENT_ID,
            clientSecret: env.GOOGLE_ADS_CLIENT_SECRET,
            developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
            apiVersion: env.GOOGLE_ADS_API_VERSION ?? 'v26',
            fetch: fetcher,
          }
        : null,
    missing: { meta: metaMissing, google: googleMissing },
    fetch: fetcher,
  };
}
