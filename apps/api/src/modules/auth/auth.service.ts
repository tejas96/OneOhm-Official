import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CurrentUser } from '@oneohm/api-contracts';
import { otpChallenges, sessions, users, verifyPassword } from '@oneohm/database';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { AppError, unauthenticated } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { loadCurrentUser } from './current-user.loader';
import { createOtpSender, type OtpSender } from './otp-sender';

const DAY_MS = 86_400_000;
const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly user: CurrentUser;
}

@Injectable()
export class AuthService {
  private readonly otp: OtpSender;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {
    this.otp = createOtpSender(env);
  }

  /** Web: email or employee ID with a password. One answer for every failure. */
  async signInWithPassword(identifier: string, password: string): Promise<IssuedSession> {
    const value = identifier.trim().toLowerCase();
    const [user] = await this.db
      .select({ id: users.id, passwordHash: users.passwordHash, status: users.status })
      .from(users)
      .where(or(eq(users.email, value), eq(sql`lower(${users.employeeCode})`, value)))
      .limit(1);
    const valid =
      user?.passwordHash &&
      user.status === 'active' &&
      (await verifyPassword(password, user.passwordHash));
    if (!user || !valid)
      throw new AppError(401, 'That email or ID and password do not match.', 'bad_credentials');
    return this.issueSession(user.id, 'web');
  }

  /** Mobile: text a code. Unknown numbers get the same answer and no message. */
  async requestOtp(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.phoneE164, phoneE164), eq(users.status, 'active')))
      .limit(1);
    if (user) {
      const code =
        this.env.OTP_DEVELOPMENT_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.db.insert(otpChallenges).values({
        phoneE164,
        codeHash: hash(`${phoneE164}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      });
      await this.otp.send(phoneE164, code);
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
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw wrong;
    if (challenge.codeHash !== hash(`${phoneE164}:${code}`)) {
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
    return this.issueSession(user.id, 'mobile');
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

  private async issueSession(userId: string, client: 'web' | 'mobile'): Promise<IssuedSession> {
    const user = await loadCurrentUser(this.db, userId);
    if (!user) throw unauthenticated('This account is not active.');
    const token = randomBytes(32).toString('base64url');
    const days = client === 'web' ? this.env.SESSION_DAYS_WEB : this.env.SESSION_DAYS_MOBILE;
    const expiresAt = new Date(Date.now() + days * DAY_MS);
    await this.db.insert(sessions).values({ userId, tokenHash: hash(token), client, expiresAt });
    await this.db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
    return { token, expiresAt, user };
  }
}
