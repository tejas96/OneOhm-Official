import { customerActions, type DatabaseExecutor, properties } from '@oneohm/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { IncomingLocation } from '../whatsapp/whatsapp-events';

type ActionRow = typeof customerActions.$inferSelect;

/**
 * The pin waits as an open action with no home while the customer picks one; a newer pin
 * replaces one still waiting. Returns the action's id (it rides in each home's tap).
 */
export async function parkPin(
  db: DatabaseExecutor,
  customerId: string,
  pin: IncomingLocation,
  among: readonly string[],
): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(customerActions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'location'),
          eq(customerActions.status, 'open'),
          isNull(customerActions.propertyId),
        ),
      );
    const [row] = await tx
      .insert(customerActions)
      .values({
        type: 'location',
        customerId,
        title: 'Location (which home?)',
        payload: { pin, among: [...among] },
      })
      .returning({ id: customerActions.id });
    if (!row) throw new Error('Customer action insert returned nothing');
    return row.id;
  });
}

/** The ask this pin answers, else a new action that records the customer's own pin. */
export async function actionFor(
  tx: DatabaseExecutor,
  customerId: string,
  propertyId: string,
  pin: IncomingLocation,
  waiting?: ActionRow,
): Promise<ActionRow> {
  if (waiting) return waiting;
  const [asked] = await tx
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.propertyId, propertyId),
        eq(customerActions.type, 'location'),
        eq(customerActions.status, 'open'),
      ),
    )
    .for('update');
  if (asked) return asked;
  const [project] = await tx
    .select({
      id: sql<
        string | null
      >`(select p.id from projects p where p.property_id = "properties"."id" and p.status <> 'cancelled' order by p.created_at desc limit 1)`,
    })
    .from(properties)
    .where(eq(properties.id, propertyId));
  const [row] = await tx
    .insert(customerActions)
    .values({
      type: 'location',
      customerId,
      propertyId,
      projectId: project?.id ?? null,
      title: 'Location from the customer',
      payload: { pin },
    })
    .returning();
  if (!row) throw new Error('Customer action insert returned nothing');
  return row;
}
