import { z } from 'zod';

/**
 * Worker settings from the environment. WhatsApp and push sending are off ("log") unless
 * WHATSAPP_DELIVERY=live or PUSH_DELIVERY=live, so development never messages real people.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  TEMPORAL_ADDRESS: z.string().default('127.0.0.1:7250'),
  TEMPORAL_NAMESPACE: z.string().default('oneohm'),
  TEMPORAL_TASK_QUEUE: z.string().default('oneohm'),
  BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
  OUTBOX_POLL_MS: z.coerce.number().int().min(500).default(3000),
  WHATSAPP_DELIVERY: z.enum(['log', 'live']).default('log'),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v25.0'),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().default('en'),
  /**
   * Testing live on a laptop: only these numbers (E.164, comma separated) get real
   * WhatsApp messages; every other message is logged. Not allowed in production.
   */
  WHATSAPP_TEST_NUMBERS: z
    .string()
    .optional()
    .transform((value) =>
      value
        ? value
            .split(',')
            .map((number) => number.replace(/[^\d+]/g, ''))
            .filter(Boolean)
        : [],
    ),
  /** Phone alerts go through Expo's push service (Firebase for Android, Apple for iOS). */
  PUSH_DELIVERY: z.enum(['log', 'live']).default('log'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** SMS for customers not on WhatsApp; "log" never texts anyone. */
  SMS_DELIVERY: z.enum(['log', 'msg91']).default('log'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SMS_TEMPLATE_ID: z.string().optional(),
  /** Signs the Pay now links in payment reminders; must equal the API's value. */
  FILE_LINK_SECRET: z.string().min(16).default('oneohm-local-file-link-secret'),
  /** Signs the Pay now links; falls back to FILE_LINK_SECRET outside production. */
  PAY_LINK_SECRET: z.string().min(16).optional(),
  PAYMENT_LINK_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  /** Marketing: "sandbox" runs against a practice platform and never leaves OneOhm. */
  MARKETING_MODE: z.enum(['live', 'sandbox']).default('live'),
  /** Encrypts the saved Meta and Google logins; must equal the API's value. */
  MARKETING_SECRET_KEY: z.string().min(16).optional(),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  META_LOGIN_CONFIG_ID: z.string().optional(),
  META_GRAPH_VERSION: z.string().default('v26.0'),
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_API_VERSION: z.string().default('v26'),
  /** The WhatsApp Business account whose marketing templates Meta approves. */
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  /** Where Meta, Google and customers reach the API (campaign photos, landing pages). */
  API_PUBLIC_URL: z.string().default('http://localhost:4200'),
  GOOGLE_MAPS_SERVER_KEY: z.string().optional(),
  GOOGLE_MAPS_API_KEY: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof schema>;

/** Marketing settings production refuses: practice mode, and a default key for real logins. */
function checkMarketing(config: WorkerConfig): void {
  if (config.NODE_ENV !== 'production') return;
  if (config.MARKETING_MODE === 'sandbox')
    throw new Error('MARKETING_MODE=sandbox is for testing only; use live in production.');
  const key = config.MARKETING_SECRET_KEY;
  const real = Boolean(key) && !key?.startsWith('oneohm-local');
  if ((config.META_APP_ID || config.GOOGLE_ADS_CLIENT_ID) && !real)
    throw new Error(
      'MARKETING_SECRET_KEY must be set to a real secret when Meta or Google is set up.',
    );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  // Blank lines in an env file (`KEY=`) mean "not set".
  const parsed = schema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== '')),
  );
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Worker settings are invalid or missing: ${fields}`);
  }
  const config = parsed.data;
  if (config.NODE_ENV === 'production') {
    if (config.FILE_LINK_SECRET.startsWith('oneohm-local'))
      throw new Error('FILE_LINK_SECRET is still the default; set a real secret in production.');
    if (!config.PAY_LINK_SECRET || config.PAY_LINK_SECRET === config.FILE_LINK_SECRET)
      throw new Error(
        'PAY_LINK_SECRET must be set, and differ from FILE_LINK_SECRET, in production.',
      );
  }
  checkMarketing(config);
  if (
    config.WHATSAPP_DELIVERY === 'live' &&
    (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    throw new Error(
      'WHATSAPP_DELIVERY=live needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
    );
  }
  if (config.NODE_ENV === 'production' && config.WHATSAPP_TEST_NUMBERS.length > 0) {
    throw new Error('WHATSAPP_TEST_NUMBERS is for testing only; remove it in production.');
  }
  if (
    config.SMS_DELIVERY === 'msg91' &&
    (!config.MSG91_AUTH_KEY || !config.MSG91_SMS_TEMPLATE_ID)
  ) {
    throw new Error('SMS_DELIVERY=msg91 needs MSG91_AUTH_KEY and MSG91_SMS_TEMPLATE_ID.');
  }
  return config;
}
