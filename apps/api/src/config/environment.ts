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
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_SENDER_ID: z.string().optional(),
    MSG91_LOGIN_TEMPLATE_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default('v25.0'),
    /** Meta webhook: the token typed when subscribing, and the app secret that signs posts. */
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    WHATSAPP_APP_SECRET: z.string().optional(),
    /** Signs the short-lived links the WhatsApp assistant sends for quotations and receipts. */
    FILE_LINK_SECRET: z.string().min(16).default('oneohm-local-file-link-secret'),
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
    PAYMENT_LINK_DAYS: z.coerce.number().int().min(1).max(180).default(30),
    /** Where customers reach this API from outside; sandbox payment pages live here. */
    API_PUBLIC_URL: z.string().url().default('http://localhost:4200'),
  })
  .superRefine((env, context) => {
    if (env.RAZORPAY_MODE === 'live')
      for (const key of [
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'RAZORPAY_WEBHOOK_SECRET',
      ] as const)
        if (!env[key])
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Needed for live payment links.',
          });
    if (env.NODE_ENV !== 'production') return;
    if (env.RAZORPAY_MODE === 'sandbox')
      context.addIssue({
        code: 'custom',
        path: ['RAZORPAY_MODE'],
        message: 'The sandbox is for testing only.',
      });
    if (env.OTP_DEVELOPMENT_CODE)
      context.addIssue({
        code: 'custom',
        path: ['OTP_DEVELOPMENT_CODE'],
        message: 'Not allowed in production.',
      });
    if (env.FILE_LINK_SECRET.startsWith('oneohm-local'))
      context.addIssue({
        code: 'custom',
        path: ['FILE_LINK_SECRET'],
        message: 'Set a real secret in production.',
      });
    for (const key of ['STORAGE_ACCESS_KEY', 'STORAGE_SECRET_KEY'] as const) {
      if (env[key].startsWith('oneohm-local'))
        context.addIssue({ code: 'custom', path: [key], message: 'Set a real key in production.' });
    }
    if (env.OTP_PROVIDER !== 'msg91')
      context.addIssue({
        code: 'custom',
        path: ['OTP_PROVIDER'],
        message: 'Use msg91 in production.',
      });
  });

export type Environment = z.infer<typeof environmentSchema>;

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
