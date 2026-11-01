import type { QuotationDetail } from '@oneohm/api-contracts';
import { customers, type Database, quotationLines, quotations } from '@oneohm/database';
import { asc, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { quotationSummaries } from '../../common/read-models/quotation-summary';

/** A quotation with its inputs, totals and priced lines, as the contract describes it. */
export async function loadQuotationDetail(db: Database, id: string): Promise<QuotationDetail> {
  const [summary] = await quotationSummaries(db, eq(quotations.id, id));
  const [row] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  if (!summary || !row) throw notFound('That quotation');
  const [customer] = await db
    .select({ phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, row.customerId))
    .limit(1);
  const lines = await db
    .select()
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, id))
    .orderBy(asc(quotationLines.position));
  const snapshot = row.snapshot as { households?: number | null };
  return {
    ...summary,
    customerPhone: customer?.phone ?? '',
    input: {
      propertyId: row.propertyId,
      leadId: row.leadId,
      subsidyCategory: row.subsidyCategory,
      households: snapshot.households ?? null,
      systemType: row.systemType,
      targetWp: row.targetWp,
      panelProductId: row.panelProductId,
      inverterProductId: row.inverterProductId,
      batteryProductId: row.batteryProductId,
      structureType: row.structureType,
      floors: row.floors,
      distanceKm: row.distanceKm,
      dcCableMeters: row.dcCableMeters,
      acCableMeters: row.acCableMeters,
      discountPaise: row.discountPaise,
    },
    totals: {
      moduleCount: row.moduleCount,
      capacityWp: row.capacityWp,
      subtotalPaise: row.subtotalPaise,
      contingencyPaise: row.contingencyPaise,
      discountPaise: row.discountPaise,
      taxPaise: row.taxPaise,
      totalPaise: row.totalPaise,
      costPaise: row.costPaise,
      marginPaise: row.marginPaise,
      subsidyPaise: row.subsidyPaise,
      subsidyIneligible:
        (row.subsidyIneligible as QuotationDetail['totals']['subsidyIneligible']) ?? null,
      effectivePaise: row.effectivePaise,
    },
    lines: lines.map(
      ({ id: _id, quotationId: _q, position: _p, unitCostPaise: _c, ...line }) => line,
    ),
  };
}
