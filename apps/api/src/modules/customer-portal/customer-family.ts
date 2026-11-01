import type { FamilyMember } from '@oneohm/api-contracts';
import { customerContacts, customers, type DatabaseExecutor } from '@oneohm/database';
import { and, asc, eq, isNull } from 'drizzle-orm';

/**
 * Who a mobile number signs in as (PRD 5.1): the customer whose number it is, or else a
 * family member the customer let in (the oldest invitation wins). Null: nobody.
 */
export async function whoSignsIn(db: DatabaseExecutor, phoneE164: string) {
  const profile = {
    id: customers.id,
    name: customers.name,
    phone: customers.phoneE164,
    email: customers.email,
  };
  const [own] = await db
    .select(profile)
    .from(customers)
    .where(eq(customers.phoneE164, phoneE164))
    .limit(1);
  if (own) return { customer: own, contact: null };
  const [shared] = await db
    .select({
      customer: profile,
      contact: {
        id: customerContacts.id,
        name: customerContacts.name,
        relation: customerContacts.relation,
      },
    })
    .from(customerContacts)
    .innerJoin(customers, eq(customers.id, customerContacts.customerId))
    .where(and(eq(customerContacts.phoneE164, phoneE164), isNull(customerContacts.revokedAt)))
    .orderBy(asc(customerContacts.createdAt))
    .limit(1);
  return shared ?? null;
}

/** The family members a customer has let in, oldest first. */
export async function familyOf(db: DatabaseExecutor, customerId: string): Promise<FamilyMember[]> {
  const rows = await db
    .select()
    .from(customerContacts)
    .where(and(eq(customerContacts.customerId, customerId), isNull(customerContacts.revokedAt)))
    .orderBy(asc(customerContacts.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    phone: row.phoneE164,
    relation: row.relation,
    createdAt: row.createdAt.toISOString(),
  }));
}
