import { z } from 'zod';

const flag = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => (value === undefined ? undefined : value === 'true'));

/** Every setting the API reads, validated once at start-up. */
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().default(4200),
    DATABASE_URL: z.string().min(1),
    WEB_BASE_URL: z.string().url().default('http://localhost:3200'),
    CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3200,http://localhost:8081'),
    BUSINESS_TIMEZONE: z.string().default('Asia/Kolkata'),
    TRUST_PROXY: flag,
    COOKIE_SECURE: flag,
    SESSION_DAYS_WEB: z.coerce.number().int().default(14),
    SESSION_DAYS_MOBILE: z.coerce.number().int().default(60),
    OTP_PROVIDER: z.enum(['local', 'msg91']).default('local'),
    OTP_DEVELOPMENT_CODE: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    /** Sign-in codes one phone may ask for in 10 minutes. */
    OTP_REQUESTS_PER_10_MIN: z.coerce.number().int().min(1).max(1000).default(3),
    /** Website enquiry form posts one address may send in 10 minutes. */
    WEBSITE_ENQUIRIES_PER_10_MIN: z.coerce.number().int().min(1).max(1000).default(5),
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_SENDER_ID: z.string().optional(),
    MSG91_LOGIN_TEMPLATE_ID: z.string().optional(),
    MSG91_PASSWORD_RESET_TEMPLATE_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default('v25.0'),
    /** `log` never calls Meta: photos customers send are stood in by a small sample file. */
    WHATSAPP_DELIVERY: z.enum(['log', 'live']).default('log'),
    /** Meta webhook: the token typed when subscribing, and the app secret that signs posts. */
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    /** Until the app secret is known: a long random key that ends the webhook URL. */
    WHATSAPP_WEBHOOK_PATH_KEY: z.string().min(32).optional(),
    /** The business WhatsApp number (E.164) customers write to; read from Meta when unset. */
    WHATSAPP_BUSINESS_NUMBER: z
      .string()
      .regex(/^\+\d{10,15}$/, 'Use the full number with country code, like +919800000000.')
      .optional(),
    /** Signs the short-lived links the WhatsApp assistant sends for quotations and receipts. */
    FILE_LINK_SECRET: z.string().min(16).default('oneohm-local-file-link-secret'),
    /** Signs the Pay now links. Falls back to FILE_LINK_SECRET outside production. */
    PAY_LINK_SECRET: z.string().min(16).optional(),
    FILE_LINK_HOURS: z.coerce.number().int().min(1).max(168).default(72),
    CHROMIUM_PATH: z.string().optional(),
    /** S3-compatible object storage (RustFS) for photos, documents and company assets. */
    STORAGE_ENDPOINT: z.string().url().default('http://127.0.0.1:9120'),
    STORAGE_REGION: z.string().default('ap-south-1'),
    STORAGE_BUCKET: z.string().default('oneohm-files'),
    STORAGE_ACCESS_KEY: z.string().default('oneohm-local'),
    STORAGE_SECRET_KEY: z.string().default('oneohm-local-secret'),
    /** Creates the bucket at start-up when missing; on by default outside production. */
    STORAGE_AUTO_CREATE_BUCKET: flag,
    /** Above this share of the price, a discount waits for an approver. */
    DISCOUNT_APPROVAL_BP: z.coerce.number().int().default(300),
    /** Online payment links: off, a local sandbox for testing, or live Razorpay. */
    RAZORPAY_MODE: z.enum(['off', 'sandbox', 'live']).default('off'),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
    /** RazorpayX payouts to vendors and crews: off, sandbox (local practice) or live. */
    RAZORPAYX_MODE: z.enum(['off', 'sandbox', 'live']).default('off'),
    /** The RazorpayX account the money is paid from (Dashboard → My Account). */
    RAZORPAYX_ACCOUNT_NUMBER: z.string().optional(),
    /** RazorpayX webhooks may use their own secret; the payment-link secret also works. */
    RAZORPAYX_WEBHOOK_SECRET: z.string().optional(),
    PAYMENT_LINK_DAYS: z.coerce.number().int().min(1).max(180).default(30),
    /** Google Maps: one key can serve every app in development; split keys in production. */
    GOOGLE_MAPS_API_KEY: z.string().optional(),
    GOOGLE_MAPS_BROWSER_KEY: z.string().optional(),
    /** Where customers reach this API from outside; sandbox payment pages live here. */
    API_PUBLIC_URL: z.string().url().default('http://localhost:4200'),
    /** Runs the WhatsApp onboarding nudge every 5 minutes; the acceptance suite turns it off. */
    ONBOARDING_NUDGE_TIMER: flag,
    /** Runs the sales checks (quote validity, promised calls, start project) every 15 minutes. */
    SALES_CHECKS_TIMER: flag,
  })
  .superRefine((env, context) => {
    const issues = [
      ...missingKeys(env),
      ...(env.NODE_ENV === 'production' ? productionIssues(env) : []),
    ];
    for (const [path, message] of issues)
      context.addIssue({ code: 'custom', path: [path], message });
  });

export type Environment = z.infer<typeof environmentSchema>;

type Issue = readonly [key: string, message: string];
type Raw = Readonly<Record<string, unknown>>;

/** Keys a chosen mode cannot work without. */
function missingKeys(env: Raw): Issue[] {
  const needs = (keys: readonly string[], message: string) =>
    keys.filter((key) => !env[key]).map((key): Issue => [key, message]);
  return [
    ...(env.OTP_PROVIDER === 'msg91'
      ? needs(['MSG91_PASSWORD_RESET_TEMPLATE_ID'], 'Needed to text password-reset codes.')
      : []),
    ...(env.RAZORPAY_MODE === 'live'
      ? needs(
          ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
          'Needed for live payment links.',
        )
      : []),
    ...(env.RAZORPAYX_MODE === 'live'
      ? needs(
          ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAYX_ACCOUNT_NUMBER'],
          'Needed for RazorpayX payouts.',
        )
      : []),
    ...(env.WHATSAPP_DELIVERY === 'live'
      ? needs(['WHATSAPP_ACCESS_TOKEN'], 'Needed to download photos customers send on WhatsApp.')
      : []),
  ];
}

/** Settings that are fine on a laptop but dangerous on the real server. */
function productionIssues(env: Raw): Issue[] {
  const rules: readonly [boolean, string, string][] = [
    [env.RAZORPAY_MODE === 'sandbox', 'RAZORPAY_MODE', 'The sandbox is for testing only.'],
    [env.RAZORPAYX_MODE === 'sandbox', 'RAZORPAYX_MODE', 'The payout sandbox is for testing only.'],
    // Test keys on the real server would take no real money: a silent loss.
    [
      env.RAZORPAY_MODE === 'live' && String(env.RAZORPAY_KEY_ID ?? '').startsWith('rzp_test_'),
      'RAZORPAY_KEY_ID',
      'Use live Razorpay keys (rzp_live_) in production.',
    ],
    // Without the app secret anyone holding the webhook link could pose as a customer.
    [
      env.WHATSAPP_DELIVERY === 'live' && !env.WHATSAPP_APP_SECRET,
      'WHATSAPP_APP_SECRET',
      'Needed in production: unsigned WhatsApp posts must be refused.',
    ],
    [
      !env.PAY_LINK_SECRET || env.PAY_LINK_SECRET === env.FILE_LINK_SECRET,
      'PAY_LINK_SECRET',
      'Set a pay-link secret of its own, different from FILE_LINK_SECRET.',
    ],
    [
      isTemporaryAddress(String(env.API_PUBLIC_URL ?? '')),
      'API_PUBLIC_URL',
      'Use the stable https domain: links sent to customers carry it for good.',
    ],
    [Boolean(env.OTP_DEVELOPMENT_CODE), 'OTP_DEVELOPMENT_CODE', 'Not allowed in production.'],
    [
      String(env.FILE_LINK_SECRET ?? '').startsWith('oneohm-local'),
      'FILE_LINK_SECRET',
      'Set a real secret in production.',
    ],
    [
      String(env.STORAGE_ACCESS_KEY ?? '').startsWith('oneohm-local'),
      'STORAGE_ACCESS_KEY',
      'Set a real key in production.',
    ],
    [
      String(env.STORAGE_SECRET_KEY ?? '').startsWith('oneohm-local'),
      'STORAGE_SECRET_KEY',
      'Set a real key in production.',
    ],
    [env.OTP_PROVIDER !== 'msg91', 'OTP_PROVIDER', 'Use msg91 in production.'],
  ];
  return rules.filter(([broken]) => broken).map(([, key, message]): Issue => [key, message]);
}

/** True for anything but a stable https address: http, localhost or a throwaway tunnel. */
export function isTemporaryAddress(address: string): boolean {
  try {
    const { protocol, hostname } = new URL(address);
    return (
      protocol !== 'https:' ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === '127.0.0.1' ||
      hostname.endsWith('.trycloudflare.com') ||
      hostname.endsWith('.loca.lt')
    );
  } catch {
    return true;
  }
}

/** Blank lines in an env file (`KEY=`) mean "not set", not an empty value. */
function withoutBlanks(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
}

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(withoutBlanks(source));
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
