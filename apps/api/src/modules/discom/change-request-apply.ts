import {
  changeRequests,
  customers,
  projectActivities,
  projectFacts,
  properties,
  type Transaction,
} from '@oneohm/database';
import { changeRequestUpdate, type PropertyUtilityPatch } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { queueWhatsApp } from '../../common/outbox';
import { definitionOf } from '../../common/read-models/change-request-type-store';
import { applyPropertyTypeChange } from './property-type-effects';

type RequestRow = typeof changeRequests.$inferSelect;

/** Project report facts that mirror the property's utility details. */
function factsFrom(patch: PropertyUtilityPatch): Record<string, string> {
  const facts: Record<string, string> = {};
  if (patch.meterHolderName) facts.consumer_name = patch.meterHolderName;
  if (patch.sanctionedLoadW) facts.sanctioned_capacity_kw = String(patch.sanctionedLoadW / 1000);
  if (patch.consumerNumber) facts.consumer_number = patch.consumerNumber;
  return facts;
}

/**
 * Finishing a change request (PRD 3.15, step 5): the property's master data is
 * updated, the replaced values are kept on the request, the linked project's report
 * facts follow, and the customer is told.
 */
export async function applyChangeRequest(
  tx: Transaction,
  request: RequestRow,
  userId: string,
): Promise<void> {
  const [row] = await tx
    .select({ property: properties, customer: customers })
    .from(properties)
    .innerJoin(customers, eq(customers.id, properties.customerId))
    .where(eq(properties.id, request.propertyId));
  if (!row) throw new Error('Change request property is missing.');
  // The site details its DISCOM's type says to update (Settings → DISCOMs).
  const definition = await definitionOf(tx, request);
  const { patch, previous } = changeRequestUpdate(
    definition.updates,
    request.values,
    request.captured,
    {
      meterHolderName: row.property.meterHolderName,
      subsidyCategory: row.property.subsidyCategory,
      phase: row.property.phase,
      sanctionedLoadW: row.property.sanctionedLoadW,
      consumerNumber: row.property.consumerNumber,
      evMeterNumber: row.property.evMeterNumber,
    },
  );
  const now = new Date();
  if (Object.keys(patch).length > 0) {
    await tx
      .update(properties)
      .set({ ...patch, updatedAt: now })
      .where(eq(properties.id, row.property.id));
  }
  await tx
    .update(changeRequests)
    .set({
      status: 'completed',
      completedAt: now,
      previousValues: previous,
      appliedValues: patch,
      updatedAt: now,
    })
    .where(eq(changeRequests.id, request.id));

  if (request.projectId) {
    for (const [key, value] of Object.entries(factsFrom(patch))) {
      await tx
        .insert(projectFacts)
        .values({ projectId: request.projectId, key, value })
        .onConflictDoUpdate({
          target: [projectFacts.projectId, projectFacts.key],
          set: { value, updatedAt: now },
        });
    }
    await tx.insert(projectActivities).values({
      projectId: request.projectId,
      kind: 'change_request',
      message: `${definition.title} ${request.number} completed; the site details are updated.`,
      userId,
    });
  }
  // A new property type re-checks the subsidy and flags open quotations (PRD 3.15).
  if (patch.subsidyCategory && patch.subsidyCategory !== row.property.subsidyCategory) {
    await applyPropertyTypeChange(
      tx,
      {
        requestId: request.id,
        number: request.number,
        propertyId: row.property.id,
        from: row.property.subsidyCategory,
        to: patch.subsidyCategory,
      },
      userId,
    );
  }
  // Routed WhatsApp, then SMS, then in person: opted-out customers still hear.
  await queueWhatsApp(
    tx,
    row.customer.phoneE164,
    'change_request_completed',
    { customer: row.customer.name, request: definition.title, number: request.number },
    `change_request_completed:${request.id}`,
  );
  await recordAudit(tx, userId, 'property.updated_by_change_request', 'property', row.property.id, {
    changeRequest: request.number,
    previous,
    applied: patch,
  });
}
