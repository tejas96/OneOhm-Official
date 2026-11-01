import type { QuotationInput } from '@oneohm/api-contracts';
import { quotationLines, type quotations } from '@oneohm/database';
import { isNull, ne, or, type SQL } from 'drizzle-orm';
import type { PricedQuotation } from './quotation-pricing.service';

type QuotationRow = typeof quotations.$inferInsert;
type LineRow = typeof quotationLines.$inferInsert;

/**
 * A quotation as saved: inputs, totals and the snapshot of rates and rule it was priced
 * with, so later changes never alter it (PRD 3.5, 3.9).
 */
export function quotationRow(
  input: QuotationInput,
  priced: PricedQuotation,
  saved: Pick<
    QuotationRow,
    | 'number'
    | 'revision'
    | 'previousQuotationId'
    | 'leadId'
    | 'customerId'
    | 'propertyId'
    | 'discountApprovedByUserId'
    | 'validUntil'
    | 'createdByUserId'
  >,
): QuotationRow {
  const totals = priced.preview.totals;
  return {
    ...saved,
    subsidyCategory: input.subsidyCategory,
    systemType: input.systemType,
    targetWp: input.targetWp,
    capacityWp: totals.capacityWp,
    moduleCount: totals.moduleCount,
    panelProductId: input.panelProductId,
    inverterProductId: input.inverterProductId,
    batteryProductId: input.batteryProductId ?? null,
    structureType: input.structureType,
    floors: input.floors,
    distanceKm: input.distanceKm,
    dcCableMeters: input.dcCableMeters ?? null,
    acCableMeters: input.acCableMeters ?? null,
    contingencyBp: priced.rates.contingencyBp,
    toleranceBp: priced.rates.toleranceBp,
    discountPaise: totals.discountPaise,
    subtotalPaise: totals.subtotalPaise,
    contingencyPaise: totals.contingencyPaise,
    taxPaise: totals.taxPaise,
    totalPaise: totals.totalPaise,
    costPaise: totals.costPaise,
    marginPaise: totals.marginPaise,
    subsidyPaise: totals.subsidyPaise,
    subsidyIneligible: totals.subsidyIneligible,
    effectivePaise: totals.effectivePaise,
    snapshot: {
      rates: priced.rates,
      rule: priced.rule,
      households: input.households ?? null,
      discountNeedsApproval: priced.preview.discountNeedsApproval,
      comparison: priced.preview.comparison,
    },
  };
}

/**
 * Lines that are part of the price: everything except optional items, which are only
 * offered (PRD 3.5). Invoices, material and cost reads use this.
 */
export function pricedLinesOnly(): SQL | undefined {
  return or(isNull(quotationLines.extraKind), ne(quotationLines.extraKind, 'optional'));
}

/** The priced lines, the engine's first, then those added by hand with their reasons. */
export function lineRows(quotationId: string, priced: PricedQuotation): LineRow[] {
  return priced.lines.map((line, position) => ({
    quotationId,
    position,
    key: line.key,
    description: line.description,
    category: line.category,
    quantity: line.quantity,
    unit: line.unit,
    unitPricePaise: line.unitPricePaise,
    unitCostPaise: line.unitCostPaise,
    taxRateBp: line.taxRateBp,
    basis: line.basis,
    amountPaise: line.amountPaise,
    contingencyPaise: line.contingencyPaise,
    discountPaise: line.discountPaise,
    taxPaise: line.taxPaise,
    totalPaise: line.totalPaise,
    costPaise: line.costPaise,
    extraKind: line.extra ?? null,
    reason: line.reason,
    productId: line.productId,
  }));
}
