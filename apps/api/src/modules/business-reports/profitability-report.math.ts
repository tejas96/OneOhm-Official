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

/** Store movements that count as the project's material (PRD Flow F step 5). */
export const MATERIAL_MOVES = ['dispatch', 'issue', 'return'] as const;

/**
 * A store movement for the project, valued at the product's cost: stock dispatched to
 * site or issued straight to the contractor (on-hand falls), or unused material the
 * contractor returned (on-hand rises, so it comes off the cost).
 */
export interface StockMoveFact {
  readonly onHandDelta: number;
  readonly unitCostPaise: number;
}

/** An employee's travel claim tagged to the project. */
export interface TravelFact {
  readonly status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  readonly amountPaise: number;
}

/** Like a bill, a claim counts while waiting or approved; declined or cancelled does not. */
export const countsAsTravel = (claim: TravelFact) =>
  claim.status === 'pending' || claim.status === 'approved';

/**
 * A bill raised from a goods receipt bought stock into the store; that stock is counted
 * when it is dispatched, so the bill is not counted a second time.
 */
export const countsAsCost = (bill: BillFact) => !(bill.party === 'vendor' && bill.fromReceipt);

/**
 * Cost so far: material out of the store at cost less what came back, every counted bill
 * whatever its status, and travel claimed for the project.
 */
export function actualCost(
  bills: readonly BillFact[],
  moves: readonly StockMoveFact[],
  travel: readonly TravelFact[] = [],
): Actual {
  const stockPaise = Math.round(
    moves.reduce((sum, row) => sum - row.onHandDelta * row.unitCostPaise, 0),
  );
  const billed = (party: BillFact['party']) =>
    bills
      .filter((bill) => bill.party === party && countsAsCost(bill))
      .reduce((sum, bill) => sum + bill.amountPaise, 0);
  const travelPaise = travel
    .filter(countsAsTravel)
    .reduce((sum, claim) => sum + claim.amountPaise, 0);
  return {
    stockPaise,
    vendorPaise: billed('vendor'),
    contractorPaise: billed('contractor'),
    travelPaise,
  };
}

export const totalOf = (actual: Actual) =>
  actual.stockPaise + actual.vendorPaise + actual.contractorPaise + actual.travelPaise;

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
