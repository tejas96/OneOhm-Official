import type { PropertyInput } from '@oneohm/api-contracts';
import { type Database, type DatabaseExecutor, properties } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { definedOnly, type Patch } from '../../common/patch';
import { assertConsumerNumberFree, assertLabelFree, freeLabel, savingSite } from './site-rules';

/** Staff who may see customers are told whose site already has a consumer number. */
export const reveals = (actor: Actor) => actor.kind === 'staff' && can(actor, 'customers.view');

/** A site typed while converting a lead; a name already taken is numbered ("Home 2"). */
export async function insertLeadSite(
  tx: DatabaseExecutor,
  actor: Actor,
  customerId: string,
  input: PropertyInput,
): Promise<string> {
  await assertConsumerNumberFree(tx, input.consumerNumber, {
    field: 'property.consumerNumber',
    reveal: reveals(actor),
  });
  const label = await freeLabel(tx, customerId, input.label);
  const [created] = await tx
    .insert(properties)
    .values({ customerId, ...input, label, households: input.households ?? null })
    .returning({ id: properties.id });
  if (!created) throw new Error('Property insert returned nothing.');
  return created.id;
}

/** Another site added on the customer page: its own name and its own consumer number. */
export async function addSite(
  db: Database,
  actor: Actor,
  customerId: string,
  input: PropertyInput,
): Promise<string> {
  await assertLabelFree(db, customerId, input.label, { field: 'label' });
  await assertConsumerNumberFree(db, input.consumerNumber, {
    field: 'consumerNumber',
    reveal: reveals(actor),
  });
  return savingSite('consumerNumber', () =>
    db.transaction(async (tx) => {
      const [created] = await tx
        .insert(properties)
        .values({ customerId, ...input, households: input.households ?? null })
        .returning({ id: properties.id });
      if (!created) throw new Error('Property insert returned nothing.');
      await recordAudit(tx, actor.userId, 'property.created', 'property', created.id, {
        customerId,
        label: input.label,
        consumerNumber: input.consumerNumber ?? null,
      });
      return created.id;
    }),
  );
}

/** A correction to a site, held to the same rules as adding one. */
export async function editSite(
  db: Database,
  actor: Actor,
  current: typeof properties.$inferSelect,
  patch: Patch<PropertyInput>,
): Promise<void> {
  if (patch.label !== undefined) {
    await assertLabelFree(db, current.customerId, patch.label, {
      exceptPropertyId: current.id,
      field: 'label',
    });
  }
  await assertConsumerNumberFree(db, patch.consumerNumber, {
    exceptPropertyId: current.id,
    field: 'consumerNumber',
    reveal: reveals(actor),
  });
  await savingSite('consumerNumber', () =>
    db
      .update(properties)
      .set({ ...definedOnly(patch), updatedAt: new Date() })
      .where(eq(properties.id, current.id)),
  );
  await recordAudit(db, actor.userId, 'property.updated', 'property', current.id, patch);
}
