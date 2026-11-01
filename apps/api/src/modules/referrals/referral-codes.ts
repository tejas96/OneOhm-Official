import { customers, type DatabaseExecutor, referralCodes } from '@oneohm/database';
import { isReferralCodeShape, makeReferralCode, normaliseReferralCode } from '@oneohm/domain';
import { eq } from 'drizzle-orm';

export interface CodeOwner {
  readonly customerId: string;
  readonly name: string;
  readonly phone: string;
  readonly code: string;
}

/** The customer's referral code, made once on first use and kept forever (PRD 5.6). */
export async function ensureReferralCode(
  db: DatabaseExecutor,
  customerId: string,
): Promise<string> {
  const [existing] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.customerId, customerId))
    .limit(1);
  if (existing) return existing.code;
  const [customer] = await db
    .select({ name: customers.name })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const [created] = await db
      .insert(referralCodes)
      .values({ customerId, code: makeReferralCode(customer?.name ?? '') })
      .onConflictDoNothing()
      .returning({ code: referralCodes.code });
    if (created) return created.code;
    // Either the code was taken or another request made this customer's code first.
    const [raced] = await db
      .select({ code: referralCodes.code })
      .from(referralCodes)
      .where(eq(referralCodes.customerId, customerId))
      .limit(1);
    if (raced) return raced.code;
  }
  throw new Error('Could not make a unique referral code.');
}

/** Who a typed or messaged code belongs to; null for an unknown code. */
export async function resolveReferralCode(
  db: DatabaseExecutor,
  text: string,
): Promise<CodeOwner | null> {
  const code = normaliseReferralCode(text);
  if (!isReferralCodeShape(code)) return null;
  const [row] = await db
    .select({
      customerId: customers.id,
      name: customers.name,
      phone: customers.phoneE164,
      code: referralCodes.code,
    })
    .from(referralCodes)
    .innerJoin(customers, eq(customers.id, referralCodes.customerId))
    .where(eq(referralCodes.code, code))
    .limit(1);
  return row ?? null;
}
