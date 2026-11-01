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
    MSG91_AUTH_KEY: z.string().optional(),
    MSG91_SENDER_ID: z.string().optional(),
    MSG91_LOGIN_TEMPLATE_ID: z.string().optional(),
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    WHATSAPP_API_VERSION: z.string().default('v25.0'),
    CHROMIUM_PATH: z.string().optional(),
    /** Above this share of the price, a discount waits for an approver. */
    DISCOUNT_APPROVAL_BP: z.coerce.number().int().default(300),
  })
  .superRefine((env, context) => {
    if (env.NODE_ENV !== 'production') return;
    if (env.OTP_DEVELOPMENT_CODE)
      context.addIssue({
        code: 'custom',
        path: ['OTP_DEVELOPMENT_CODE'],
        message: 'Not allowed in production.',
      });
    if (env.OTP_PROVIDER !== 'msg91')
      context.addIssue({
        code: 'custom',
        path: ['OTP_PROVIDER'],
        message: 'Use msg91 in production.',
      });
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  const parsed = environmentSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment:\n  ${problems.join('\n  ')}`);
  }
  return parsed.data;
}
