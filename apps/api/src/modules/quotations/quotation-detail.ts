import type { ExtraLineInput, QuotationDetail } from '@oneohm/api-contracts';
import { customers, type Database, quotationLines, quotations } from '@oneohm/database';
import { EXTRA_KINDS, type ExtraKind } from '@oneohm/domain';
import { asc, eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';
import { quotationSummaries } from '../../common/read-models/quotation-summary';

type LineRow = typeof quotationLines.$inferSelect;

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
      extras: extrasOf(lines),
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
      optionalPaise: lines
        .filter((line) => line.extraKind === 'optional')
        .reduce((sum, line) => sum + line.totalPaise, 0),
    },
    lines: lines.map(
      ({
        id: _id,
        quotationId: _q,
        position: _p,
        unitCostPaise: _c,
        productId: _product,
        extraKind,
        ...line
      }) => ({ ...line, extra: asExtraKind(extraKind) }),
    ),
    rejectionReason: row.rejectionReason,
  };
}

const asExtraKind = (value: string | null): ExtraKind | null =>
  (EXTRA_KINDS as readonly string[]).includes(value ?? '') ? (value as ExtraKind) : null;

/** The hand-added lines as sales entered them, so a revision starts from them. */
function extrasOf(lines: readonly LineRow[]): ExtraLineInput[] {
  return lines.flatMap((line) => {
    const kind = asExtraKind(line.extraKind);
    if (!kind) return [];
    return [
      {
        kind,
        productId: line.productId,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPricePaise: line.unitPricePaise,
        unitCostPaise: line.unitCostPaise,
        reason: line.reason ?? '',
      },
    ];
  });
}
