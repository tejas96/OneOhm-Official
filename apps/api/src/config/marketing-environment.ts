import { LOCAL_MARKETING_KEY } from '@oneohm/marketing';
import { z } from 'zod';

/** Marketing settings (spec 2026-11-15). Every key is optional: missing ones show "not connected". */
export const marketingEnvironmentShape = {
  /** live talks to Meta and Google; sandbox is a local practice platform (development only). */
  MARKETING_MODE: z.enum(['live', 'sandbox']).default('live'),
  /** Encrypts the Meta and Google tokens at rest. Required in production. */
  MARKETING_SECRET_KEY: z.string().min(32).optional(),
  /** The Meta app (Facebook Login for Business) and its secret; the WhatsApp app secret is used when the same app. */
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v26.0'),
  /** The token typed when subscribing Meta's page and Instagram webhook; falls back to the WhatsApp one. */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  /** The WhatsApp Business account, for marketing template approval and the Conversions API dataset. */
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  /** Google Cloud OAuth client and the Google Ads developer token. */
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_API_VERSION: z.string().default('v26'),
} as const;

type Raw = Readonly<Record<string, unknown>>;

/** Marketing settings that are fine on a laptop but dangerous on the real server. */
export function marketingProductionIssues(env: Raw): (readonly [string, string])[] {
  const issues: (readonly [string, string])[] = [];
  if (env.MARKETING_MODE === 'sandbox')
    issues.push(['MARKETING_MODE', 'The marketing sandbox is for testing only.']);
  const connects = Boolean(env.META_APP_ID || env.GOOGLE_ADS_CLIENT_ID);
  const key = String(env.MARKETING_SECRET_KEY ?? '');
  if (connects && (!key || key === LOCAL_MARKETING_KEY))
    issues.push([
      'MARKETING_SECRET_KEY',
      'Set a long random key: it encrypts the Meta and Google tokens.',
    ]);
  return issues;
}
