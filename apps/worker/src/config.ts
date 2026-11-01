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
  /** Phone alerts go through Expo's push service (Firebase for Android, Apple for iOS). */
  PUSH_DELIVERY: z.enum(['log', 'live']).default('log'),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  /** SMS for customers not on WhatsApp; "log" never texts anyone. */
  SMS_DELIVERY: z.enum(['log', 'msg91']).default('log'),
  MSG91_AUTH_KEY: z.string().optional(),
  MSG91_SMS_TEMPLATE_ID: z.string().optional(),
});

export type WorkerConfig = z.infer<typeof schema>;

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
  if (
    config.WHATSAPP_DELIVERY === 'live' &&
    (!config.WHATSAPP_ACCESS_TOKEN || !config.WHATSAPP_PHONE_NUMBER_ID)
  ) {
    throw new Error(
      'WHATSAPP_DELIVERY=live needs WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.',
    );
  }
  if (
    config.SMS_DELIVERY === 'msg91' &&
    (!config.MSG91_AUTH_KEY || !config.MSG91_SMS_TEMPLATE_ID)
  ) {
    throw new Error('SMS_DELIVERY=msg91 needs MSG91_AUTH_KEY and MSG91_SMS_TEMPLATE_ID.');
  }
  return config;
}
