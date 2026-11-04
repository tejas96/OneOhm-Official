import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { hashPassword, otpChallenges, sessions, users } from '@oneohm/database';
import { and, desc, eq, gt, isNull, lt, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { assertOtpBudget, recordAttempt } from '../../common/auth/sign-in-guard';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { createOtpSender, type OtpSender } from './otp-sender';
import { hashSecret, type IssuedSession, issueSession } from './session-issuer';

const PURPOSE = 'password_reset';
const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;

/**
 * A person with no web password yet, or who forgot it, proves they hold their phone with
 * a texted code and then chooses a password. Same checks as the mobile sign-in code, kept
 * apart (own purpose, own budget) so one cannot use up the other.
 */
@Injectable()
export class PasswordSetupService {
  private readonly otp: OtpSender;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {
    this.otp = createOtpSender(env);
  }

  /** Texts a code. Unknown or switched-off numbers get the same answer and no message. */
  async requestCode(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), eq(users.status, 'active')))
      .limit(1);
    if (user) {
      await assertOtpBudget(this.db, phoneE164, PURPOSE, this.env.OTP_REQUESTS_PER_10_MIN);
      const code =
        this.env.OTP_DEVELOPMENT_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.db.insert(otpChallenges).values({
        phoneE164,
        purpose: PURPOSE,
        codeHash: hashSecret(`${phoneE164}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      });
      await this.otp.send(phoneE164, code, 'password_reset');
    }
    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  /** Checks the code, saves the password, signs out every other session, signs in on the web. */
  async setPassword(
    phoneE164: string,
    code: string,
    password: string,
    ip: string | null,
  ): Promise<IssuedSession> {
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phoneE164, phoneE164),
          eq(otpChallenges.purpose, PURPOSE),
          isNull(otpChallenges.consumedAt),
          gt(otpChallenges.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(otpChallenges.createdAt))
      .limit(1);
    const wrong = new AppError(
      401,
      'That code is not right or has expired. Ask for a new one.',
      'bad_code',
    );
    const attempt = { identifier: phoneE164, method: 'password_reset' as const, ip, userId: null };
    if (!challenge) {
      await recordAttempt(this.db, { ...attempt, success: false });
      throw wrong;
    }
    // Every guess, right or wrong, spends one of the tries before it is checked, in one
    // database step, so a burst of parallel guesses cannot check more than the allowed few.
    const reserved = await this.db
      .update(otpChallenges)
      .set({ attempts: sql`${otpChallenges.attempts} + 1` })
      .where(
        and(
          eq(otpChallenges.id, challenge.id),
          isNull(otpChallenges.consumedAt),
          lt(otpChallenges.attempts, OTP_MAX_ATTEMPTS),
        ),
      )
      .returning({ attempts: otpChallenges.attempts });
    if (reserved.length === 0 || challenge.codeHash !== hashSecret(`${phoneE164}:${code}`)) {
      await recordAttempt(this.db, { ...attempt, success: false });
      throw wrong;
    }
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), eq(users.status, 'active')))
      .limit(1);
    if (!user) {
      await recordAttempt(this.db, { ...attempt, success: false });
      throw wrong;
    }
    const passwordHash = await hashPassword(password);
    const done = await this.db.transaction(async (tx) => {
      // Only one request can use the code: the others find it already consumed.
      const used = await tx
        .update(otpChallenges)
        .set({ consumedAt: new Date() })
        .where(and(eq(otpChallenges.id, challenge.id), isNull(otpChallenges.consumedAt)))
        .returning({ id: otpChallenges.id });
      if (used.length === 0) return false;
      // Any other unused code for this phone dies with it.
      await tx
        .update(otpChallenges)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(otpChallenges.phoneE164, phoneE164),
            eq(otpChallenges.purpose, PURPOSE),
            isNull(otpChallenges.consumedAt),
          ),
        );
      await tx.update(users).set({ passwordHash }).where(eq(users.id, user.id));
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      await recordAudit(
        tx,
        user.id,
        user.passwordHash ? 'auth.password_reset' : 'auth.password_set',
        'user',
        user.id,
        { ip },
      );
      await recordAttempt(tx, { ...attempt, userId: user.id, success: true });
      return true;
    });
    if (!done) {
      await recordAttempt(this.db, { ...attempt, success: false });
      throw wrong;
    }
    return issueSession(this.db, this.env, user.id, 'web');
  }
}
