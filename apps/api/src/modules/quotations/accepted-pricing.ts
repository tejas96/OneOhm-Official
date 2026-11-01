import { type DatabaseExecutor, quotationLines, quotations } from '@oneohm/database';
import {
  type RateCard,
  type SavedLinePrice,
  type StateTopUpRule,
  type SubsidyRule,
  toCostingCard,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { notFound } from '../../common/http/errors';

/**
 * What an accepted quotation was priced with: its own rates, subsidy rule and saved line
 * prices. Re-pricing after the survey uses these, so only what was measured changes the
 * price (PRD 3.5, 3.9: rate changes never silently change accepted quotations).
 */
export interface AcceptedPricing {
  readonly quotationId: string;
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
  /** Quotations saved before the state top-up have none: ₹0, exactly as accepted. */
  readonly stateRule: StateTopUpRule | null;
  readonly lines: readonly SavedLinePrice[];
  /** The products the accepted quotation picked; their saved prices belong to them only. */
  readonly picks?: {
    readonly panel: string;
    readonly inverter: string;
    readonly battery: string | null;
  };
}

/**
 * Saved panel, inverter or battery prices, only for the product the accepted quotation
 * picked: a survey revision keeps them, while a scope change that swaps in another
 * product prices that one from today's catalog (PRD 3.6, 3.9).
 */
export function savedFor(
  against: AcceptedPricing | undefined,
  key: 'panel' | 'inverter' | 'battery',
  productId: string,
): readonly SavedLinePrice[] {
  if (!against) return [];
  return !against.picks || against.picks[key] === productId ? against.lines : [];
}

export async function acceptedPricing(
  db: DatabaseExecutor,
  quotationId: string,
): Promise<AcceptedPricing> {
  const [row] = await db
    .select({
      snapshot: quotations.snapshot,
      panel: quotations.panelProductId,
      inverter: quotations.inverterProductId,
      battery: quotations.batteryProductId,
    })
    .from(quotations)
    .where(eq(quotations.id, quotationId))
    .limit(1);
  if (!row) throw notFound('That quotation');
  const snapshot = row.snapshot as {
    rates: unknown;
    rule?: SubsidyRule | null;
    stateRule?: StateTopUpRule | null;
  };
  const lines = await db
    .select({
      key: quotationLines.key,
      unitPricePaise: quotationLines.unitPricePaise,
      unitCostPaise: quotationLines.unitCostPaise,
      taxRateBp: quotationLines.taxRateBp,
    })
    .from(quotationLines)
    .where(eq(quotationLines.quotationId, quotationId));
  // Quotations saved before the costing card hold the flat card: read through the same
  // mapping the rate card was upgraded with, so they price exactly as when accepted.
  const rates = toCostingCard(snapshot.rates);
  return {
    quotationId,
    rates,
    rule: snapshot.rule ?? null,
    stateRule: snapshot.stateRule ?? null,
    picks: { panel: row.panel, inverter: row.inverter, battery: row.battery },
    lines,
  };
}
