import { customerActions, type DatabaseExecutor, properties } from '@oneohm/database';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
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
    const replaced = await tx
      .update(customerActions)
      .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'location'),
          eq(customerActions.status, 'open'),
          isNull(customerActions.propertyId),
        ),
      )
      .returning({ id: customerActions.id });
    for (const old of replaced)
      await recordAudit(tx, null, 'customer_action.location_replaced', 'customer_action', old.id);
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

/**
 * The pin waited as its own action while the customer picked a home. If the team had an open ask
 * for that home, the pin answers it: the waiting action closes into it (log and audit say so), so
 * no ask is left to keep reminding. Else the waiting action itself carries the answer.
 */
async function adoptAsk(
  tx: DatabaseExecutor,
  customerId: string,
  propertyId: string,
  waiting: ActionRow,
): Promise<ActionRow> {
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
  if (!asked) return waiting;
  await tx
    .update(customerActions)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(eq(customerActions.id, waiting.id));
  await recordAudit(tx, null, 'customer_action.location_adopted', 'customer_action', waiting.id, {
    into: asked.id,
  });
  return { ...asked, payload: { ...asked.payload, pin: waiting.payload.pin } };
}

/** The ask this pin answers, else a new action that records the customer's own pin. */
export async function actionFor(
  tx: DatabaseExecutor,
  customerId: string,
  propertyId: string,
  pin: IncomingLocation,
  waiting?: ActionRow,
): Promise<ActionRow> {
  if (waiting) return adoptAsk(tx, customerId, propertyId, waiting);
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
