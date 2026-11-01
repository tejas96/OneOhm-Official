import { customers, type DatabaseExecutor } from '@oneohm/database';
import { and, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { definedOnly, type Patch } from '../../common/patch';

export type CustomerPatch = Patch<{
  name: string;
  phone: string;
  email: string | null;
  kind: 'individual' | 'organization';
  gstin: string | null;
}>;

/**
 * Corrects who the customer is (PRD 3.2): name, phone, email, person or organisation,
 * GSTIN. A phone stays unique, so one number never means two customers. Audited.
 */
export async function editCustomer(
  db: DatabaseExecutor,
  actor: Actor,
  id: string,
  patch: CustomerPatch,
): Promise<void> {
  const [current] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
  if (!current) throw notFound('That customer');
  if (patch.phone && patch.phone !== current.phoneE164) {
    const [other] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.phoneE164, patch.phone), ne(customers.id, id)))
      .limit(1);
    if (other) throw conflict(`${other.name} already has this phone number.`, 'duplicate_phone');
  }
  const { phone, ...rest } = patch;
  const sent = definedOnly({ ...rest, phoneE164: phone });
  // Only what really changes is written and audited.
  const changes = Object.fromEntries(
    Object.entries(sent).filter(([key, value]) => current[key as keyof typeof current] !== value),
  ) as typeof sent;
  if (Object.keys(changes).length === 0) return;
  await db
    .update(customers)
    .set({ ...changes, updatedAt: new Date() })
    .where(eq(customers.id, id));
  const before = Object.fromEntries(
    Object.keys(changes).map((key) => [key, current[key as keyof typeof current]]),
  );
  await recordAudit(db, actor.userId, 'customer.updated', 'customer', id, {
    before,
    after: changes,
  });
}
