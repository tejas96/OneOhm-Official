import type { QuotationSummary } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  projects,
  properties,
  quotations,
} from '@oneohm/database';
import { desc, eq, inArray, type SQL } from 'drizzle-orm';

/** Quotation list rows with the customer, property and any project made from them. */
export async function quotationSummaries(
  db: DatabaseExecutor,
  where?: SQL,
): Promise<QuotationSummary[]> {
  const query = db
    .select({
      quotation: quotations,
      customerName: customers.name,
      propertyLabel: properties.label,
    })
    .from(quotations)
    .innerJoin(customers, eq(customers.id, quotations.customerId))
    .innerJoin(properties, eq(properties.id, quotations.propertyId))
    .orderBy(desc(quotations.createdAt));
  const rows = where ? await query.where(where) : await query;
  const ids = rows.map((row) => row.quotation.id);
  const linked = ids.length
    ? await db
        .select({ id: projects.id, quotationId: projects.quotationId })
        .from(projects)
        .where(inArray(projects.quotationId, ids))
    : [];
  return rows.map(({ quotation, customerName, propertyLabel }) => ({
    id: quotation.id,
    number: quotation.number,
    revision: quotation.revision,
    status: quotation.status,
    customer: { id: quotation.customerId, name: customerName },
    propertyLabel,
    capacityWp: quotation.capacityWp,
    totalPaise: quotation.totalPaise,
    subsidyPaise: quotation.subsidyPaise,
    effectivePaise: quotation.effectivePaise,
    discountPendingApproval:
      quotation.discountPaise > 0 &&
      quotation.discountApprovedByUserId === null &&
      needsApproval(quotation.snapshot),
    validUntil: quotation.validUntil,
    createdAt: quotation.createdAt.toISOString(),
    projectId: linked.find((project) => project.quotationId === quotation.id)?.id ?? null,
  }));
}

function needsApproval(snapshot: unknown): boolean {
  return (
    typeof snapshot === 'object' &&
    snapshot !== null &&
    (snapshot as { discountNeedsApproval?: boolean }).discountNeedsApproval === true
  );
}
