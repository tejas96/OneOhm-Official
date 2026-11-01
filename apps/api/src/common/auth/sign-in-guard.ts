import { type DatabaseExecutor, otpChallenges, signInAttempts } from '@oneohm/database';
import { and, eq, gt, sql } from 'drizzle-orm';
import { tooMany } from '../http/errors';

/** Wrong tries allowed for one name, and from one address, inside the window. */
export const LOCKOUT = { perIdentifier: 5, perAddress: 20, windowMinutes: 15 } as const;
const OTP_WINDOW_MINUTES = 10;

const since = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function failures(db: DatabaseExecutor, where: ReturnType<typeof eq>): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(signInAttempts)
    .where(
      and(
        where,
        eq(signInAttempts.success, false),
        gt(signInAttempts.createdAt, since(LOCKOUT.windowMinutes)),
      ),
    );
  return row?.count ?? 0;
}

/** Refuses to check a password after too many recent wrong tries (PRD 7.3). */
export async function assertNotLocked(
  db: DatabaseExecutor,
  identifier: string,
  ip: string | null,
): Promise<void> {
  const message = `Too many wrong tries. Wait ${LOCKOUT.windowMinutes} minutes, or ask an admin to reset your password.`;
  if ((await failures(db, eq(signInAttempts.identifier, identifier))) >= LOCKOUT.perIdentifier)
    throw tooMany(message);
  if (ip && (await failures(db, eq(signInAttempts.ip, ip))) >= LOCKOUT.perAddress)
    throw tooMany(message);
}

export async function recordAttempt(
  db: DatabaseExecutor,
  attempt: {
    identifier: string;
    method: 'password' | 'otp' | 'customer_otp';
    ip: string | null;
    userId: string | null;
    success: boolean;
  },
): Promise<void> {
  await db.insert(signInAttempts).values(attempt);
}

/** At most a few codes per phone in a short time, so nobody floods a number with SMS. */
export async function assertOtpBudget(
  db: DatabaseExecutor,
  phoneE164: string,
  purpose: string,
  perWindow: number,
): Promise<void> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(otpChallenges)
    .where(
      and(
        eq(otpChallenges.phoneE164, phoneE164),
        eq(otpChallenges.purpose, purpose),
        gt(otpChallenges.createdAt, since(OTP_WINDOW_MINUTES)),
      ),
    );
  if ((row?.count ?? 0) >= perWindow)
    throw tooMany(`Too many codes asked for. Wait ${OTP_WINDOW_MINUTES} minutes and try again.`);
}
