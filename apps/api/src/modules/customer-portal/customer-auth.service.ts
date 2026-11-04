import { createHash, randomBytes, randomInt } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CustomerProfile } from '@oneohm/api-contracts';
import { customerSessions, otpChallenges } from '@oneohm/database';
import { customerLanguage } from '@oneohm/domain';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';
import type { Request } from 'express';
import { bearerToken } from '../../common/auth/session-cookies';
import { assertOtpBudget } from '../../common/auth/sign-in-guard';
import { AppError, unauthenticated } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { createOtpSender, type OtpSender } from '../auth/otp-sender';
import { whoSignsIn } from './customer-family';

const DAY_MS = 86_400_000;
const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const PURPOSE = 'customer';
const hash = (value: string) => createHash('sha256').update(value).digest('base64url');

/**
 * Customer app sign-in: a one-time code to the mobile number on the customer record.
 * Codes and tokens are stored only as hashes; unknown numbers get the same answer.
 */
@Injectable()
export class CustomerAuthService {
  private readonly otp: OtpSender;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
  ) {
    this.otp = createOtpSender(env);
  }

  async requestCode(phoneE164: string): Promise<{ expiresInSeconds: number }> {
    if (await whoSignsIn(this.db, phoneE164)) {
      await assertOtpBudget(this.db, phoneE164, PURPOSE, this.env.OTP_REQUESTS_PER_10_MIN);
      const code =
        this.env.OTP_DEVELOPMENT_CODE ?? String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.db.insert(otpChallenges).values({
        phoneE164,
        purpose: PURPOSE,
        codeHash: hash(`${PURPOSE}:${phoneE164}:${code}`),
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      });
      await this.otp.send(phoneE164, code, 'login');
    }
    return { expiresInSeconds: OTP_TTL_SECONDS };
  }

  async verifyCode(
    phoneE164: string,
    code: string,
  ): Promise<{ token: string; customer: CustomerProfile }> {
    const wrong = new AppError(
      401,
      'That code is not right or has expired. Ask for a new one.',
      'bad_code',
    );
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
    if (!challenge || challenge.attempts >= OTP_MAX_ATTEMPTS) throw wrong;
    if (challenge.codeHash !== hash(`${PURPOSE}:${phoneE164}:${code}`)) {
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
    const who = await whoSignsIn(this.db, phoneE164);
    if (!who) throw wrong;
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(customerSessions).values({
      customerId: who.customer.id,
      contactId: who.contact?.id ?? null,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + this.env.SESSION_DAYS_MOBILE * DAY_MS),
    });
    return {
      token,
      customer: {
        ...who.customer,
        language: customerLanguage(who.customer.language),
        viewer: who.contact ? { name: who.contact.name, relation: who.contact.relation } : null,
      },
    };
  }

  /** The customer behind a bearer token, or null. */
  async authenticate(
    token: string,
  ): Promise<{ customerId: string; sessionId: string; contactId: string | null } | null> {
    const now = new Date();
    const [session] = await this.db
      .select({
        id: customerSessions.id,
        customerId: customerSessions.customerId,
        contactId: customerSessions.contactId,
      })
      .from(customerSessions)
      .where(
        and(
          eq(customerSessions.tokenHash, hash(token)),
          isNull(customerSessions.revokedAt),
          gt(customerSessions.expiresAt, now),
        ),
      )
      .limit(1);
    if (!session) return null;
    await this.db
      .update(customerSessions)
      .set({ lastSeenAt: now })
      .where(eq(customerSessions.id, session.id));
    return { customerId: session.customerId, sessionId: session.id, contactId: session.contactId };
  }

  async signOut(sessionId: string): Promise<void> {
    await this.db
      .update(customerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(customerSessions.id, sessionId));
  }
}

/** The signed-in customer behind a request's bearer token, or 401. */
export async function customerSession(auth: CustomerAuthService, request: Request) {
  const token = bearerToken(request);
  const found = token ? await auth.authenticate(token) : null;
  if (!found) throw unauthenticated();
  return found;
}
