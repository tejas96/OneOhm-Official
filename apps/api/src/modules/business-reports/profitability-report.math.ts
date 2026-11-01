import type { ProfitabilityReport } from '@oneohm/api-contracts';
import { type LineCategory, share } from '@oneohm/domain';

type Actual = ProfitabilityReport['byProject'][number]['actual'];
type Estimate = ProfitabilityReport['cost']['estimate'];

/** Quotation lines that are equipment and material; installation is the crew's work. */
const MATERIAL: ReadonlySet<LineCategory> = new Set([
  'panel',
  'inverter',
  'battery',
  'structure',
  'cable',
  'electrical',
]);

export function estimateKind(category: LineCategory): keyof Estimate {
  if (MATERIAL.has(category)) return 'materialPaise';
  return category === 'installation' ? 'installationPaise' : 'otherPaise';
}

/** The quoted cost split into material, installation and the rest (transport, liaisoning). */
export function splitEstimate(
  lines: readonly { readonly category: LineCategory; readonly costPaise: number }[],
): Estimate {
  const estimate = { materialPaise: 0, installationPaise: 0, otherPaise: 0 };
  for (const line of lines) estimate[estimateKind(line.category)] += line.costPaise;
  return estimate;
}

/** A vendor or contractor bill on the project; `fromReceipt` bills bought stock. */
export interface BillFact {
  readonly party: 'vendor' | 'contractor';
  readonly status: 'pending' | 'approved' | 'paid';
  readonly amountPaise: number;
  readonly fromReceipt: boolean;
}

/** Stock leaving for the site: on-hand falls, valued at the product's cost. */
export interface DispatchFact {
  readonly onHandDelta: number;
  readonly unitCostPaise: number;
}

/**
 * A bill raised from a goods receipt bought stock into the store; that stock is counted
 * when it is dispatched, so the bill is not counted a second time.
 */
export const countsAsCost = (bill: BillFact) => !(bill.party === 'vendor' && bill.fromReceipt);

/** Cost so far: stock dispatched at cost, plus every counted bill whatever its status. */
export function actualCost(
  bills: readonly BillFact[],
  dispatches: readonly DispatchFact[],
): Actual {
  const stockPaise = Math.round(
    dispatches.reduce((sum, row) => sum - row.onHandDelta * row.unitCostPaise, 0),
  );
  const billed = (party: BillFact['party']) =>
    bills
      .filter((bill) => bill.party === party && countsAsCost(bill))
      .reduce((sum, bill) => sum + bill.amountPaise, 0);
  return { stockPaise, vendorPaise: billed('vendor'), contractorPaise: billed('contractor') };
}

export const totalOf = (actual: Actual) =>
  actual.stockPaise + actual.vendorPaise + actual.contractorPaise;

/** Contract (without GST) against estimated and actual cost: variance and margins. */
export function profit(contractPaise: number, estimatedCostPaise: number, actualPaise: number) {
  return {
    variancePaise: actualPaise - estimatedCostPaise,
    overBudget: actualPaise > estimatedCostPaise,
    estimatedMarginRate: share(contractPaise - estimatedCostPaise, contractPaise),
    marginSoFarRate: share(contractPaise - actualPaise, contractPaise),
  };
}

/** The accepted price: a survey revision once the customer accepted it, else the original. */
export function acceptedQuotationId(
  project: { readonly quotationId: string; readonly revisionQuotationId: string | null },
  statusOf: ReadonlyMap<string, string>,
): string {
  const revision = project.revisionQuotationId;
  return revision && statusOf.get(revision) === 'accepted' ? revision : project.quotationId;
}

/** Lowest margin so far first; a project with no price sorts last. */
export function byMarginAscending(
  a: { readonly marginSoFarRate: number | null; readonly code: string },
  b: { readonly marginSoFarRate: number | null; readonly code: string },
): number {
  const left = a.marginSoFarRate ?? Number.POSITIVE_INFINITY;
  const right = b.marginSoFarRate ?? Number.POSITIVE_INFINITY;
  return left === right ? a.code.localeCompare(b.code) : left - right;
}
