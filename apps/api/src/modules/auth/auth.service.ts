import { randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { otpChallenges, sessions, users, verifyPassword } from '@oneohm/database';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { assertNotLocked, assertOtpBudget, recordAttempt } from '../../common/auth/sign-in-guard';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { loadCurrentUser } from './current-user.loader';
import { createOtpSender, type OtpSender } from './otp-sender';
import { hashSecret, type IssuedSession, issueSession } from './session-issuer';
import { parseIdentifier } from './sign-in-identifier';

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const hash = hashSecret;

@Injectable()
export class AuthService {
  private readonly otp: OtpSender;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {
    this.otp = createOtpSender(env);
  }

  /**
   * Web: email, employee ID or mobile number with a password. One answer for every failure; too many
   * wrong tries lock the name (and a noisy address) for a while. Every try is recorded.
   */
  async signInWithPassword(
    identifier: string,
    password: string,
    ip: string | null = null,
  ): Promise<IssuedSession> {
    const { kind, value } = parseIdentifier(identifier);
    await assertNotLocked(this.db, value, ip);
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(
        kind === 'phone'
          ? eq(users.phoneE164, value)
          : kind === 'email'
            ? eq(users.email, value)
            : eq(sql`lower(${users.employeeCode})`, value),
      )
      .limit(1);
    const valid =
      user?.passwordHash &&
      user.status === 'active' &&
      (await verifyPassword(password, user.passwordHash));
    const attempt = {
      identifier: value,
      method: 'password' as const,
      ip,
      userId: user?.id ?? null,
    };
    if (!user || !valid) {
      await recordAttempt(this.db, { ...attempt, success: false });
      if (user && user.status === 'active' && !user.passwordHash) {
        throw new AppError(
          401,
          'You haven\'t set a password yet. Tap "First time here?" below.',
          'password_not_set',
        );
      }
      throw new AppError(
        401,
        'That email, ID or mobile number and password do not match.',
        'bad_credentials',
      );
    }
    await recordAttempt(this.db, { ...attempt, success: true });
    await recordAudit(this.db, user.id, 'auth.signed_in', 'user', user.id, {
      method: 'password',
      ip,
    });
    return issueSession(this.db, this.env, user.id, 'web');
  }

  /** Mobile: text a code. Unknown numbers get the same answer and no message. */
  async requestOtp(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), eq(users.status, 'active')))
      .limit(1);
    if (user) {
      await assertOtpBudget(this.db, phoneE164, 'staff', this.env.OTP_REQUESTS_PER_10_MIN);
      const code =
        this.env.OTP_DEVELOPMENT_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.db.insert(otpChallenges).values({
        phoneE164,
        codeHash: hash(`${phoneE164}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      });
      await this.otp.send(phoneE164, code, 'login');
    }
    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyOtp(phoneE164: string, code: string): Promise<IssuedSession> {
    const [challenge] = await this.db
      .select()
      .from(otpChallenges)
      .where(
        and(
          eq(otpChallenges.phoneE164, phoneE164),
          eq(otpChallenges.purpose, 'staff'),
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
    const attempt = { identifier: phoneE164, method: 'otp' as const, ip: null, userId: null };
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) {
      await recordAttempt(this.db, { ...attempt, success: false });
      throw wrong;
    }
    if (challenge.codeHash !== hash(`${phoneE164}:${code}`)) {
      await recordAttempt(this.db, { ...attempt, success: false });
      await this.db
        .update(otpChallenges)
        .set({ attempts: challenge.attempts + 1 })
        .where(eq(otpChallenges.id, challenge.id));
      throw wrong;
    }
    await this.db
      .update(otpChallenges)
      .set({ consumedAt: new Date() })
      .where(eq(otpChallenges.id, challenge.id));
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phoneE164, phoneE164))
      .limit(1);
    if (!user) throw wrong;
    await recordAttempt(this.db, { ...attempt, userId: user.id, success: true });
    await recordAudit(this.db, user.id, 'auth.signed_in', 'user', user.id, { method: 'otp' });
    return issueSession(this.db, this.env, user.id, 'mobile');
  }

  async authenticate(token: string, via: Actor['via']): Promise<Actor | null> {
    const now = new Date();
    const [session] = await this.db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(
        and(
          eq(sessions.tokenHash, hash(token)),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now),
        ),
      )
      .limit(1);
    if (!session) return null;
    const user = await loadCurrentUser(this.db, session.userId);
    if (!user) return null;
    await this.db.update(sessions).set({ lastSeenAt: now }).where(eq(sessions.id, session.id));
    return {
      userId: user.id,
      sessionId: session.id,
      fullName: user.fullName,
      kind: user.kind,
      roleKeys: user.roles.map((role) => role.key),
      capabilities: new Set(user.capabilities),
      user,
      via,
    };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }
}
