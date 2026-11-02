import type {
  ProjectChangeImpact,
  ProjectChangeInput,
  QuotationInput,
  QuotationTotals,
} from '@oneohm/api-contracts';
import { type DatabaseExecutor, products } from '@oneohm/database';
import { inverterPicks, inverterSummary, type PriceSide, type ScopeChoices } from '@oneohm/domain';
import { inArray } from 'drizzle-orm';

/**
 * The accepted quotation's choices with the change applied. The site, category, discount
 * and measurements stay as accepted; only what "Change scope" offers moves.
 */
export function changedInput(accepted: QuotationInput, change: ProjectChangeInput): QuotationInput {
  return {
    ...accepted,
    targetWp: change.targetWp,
    panelProductId: change.panelProductId,
    inverters: change.inverters,
    inverterProductId: change.inverters[0]?.productId,
    batteryProductId: change.batteryProductId,
    structureType: change.structureType,
    extras: change.extras,
  };
}

/**
 * Hand-added lines already on the accepted quotation stay as they are, in order; a change
 * adds new ones after them. Saved prices follow line positions, so this keeps them right.
 */
export function keepsAcceptedExtras(accepted: QuotationInput, change: ProjectChangeInput): boolean {
  const before = choicesOf(accepted).extras;
  const after = choicesOf({ ...accepted, extras: change.extras }).extras;
  return before.every((line, index) => JSON.stringify(line) === JSON.stringify(after[index]));
}

/** The choices a change compares, from a quotation input. */
export function choicesOf(input: QuotationInput): ScopeChoices {
  return {
    targetWp: input.targetWp,
    panelProductId: input.panelProductId,
    inverters: inverterPicks(input),
    batteryProductId: input.batteryProductId ?? null,
    structureType: input.structureType,
    extras: (input.extras ?? []).map((line) => ({
      kind: line.kind,
      productId: line.productId ?? null,
      description: line.description,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
    })),
  };
}

/** The money lines of one side of the change. */
export function sideOf(totals: QuotationTotals): PriceSide {
  return {
    totalPaise: totals.totalPaise,
    subsidyPaise: totals.subsidyPaise,
    subsidyIneligible: totals.subsidyIneligible,
    stateSupportPaise: totals.stateSupportPaise ?? 0,
    effectivePaise: totals.effectivePaise,
    capacityWp: totals.capacityWp,
  };
}

type ScopeView = ProjectChangeImpact['scope']['before'];

/** Both systems in plain words: sizes, product names, DCR or not, hand-added lines. */
export async function scopeViews(
  db: DatabaseExecutor,
  sides: readonly { input: QuotationInput; totals: QuotationTotals }[],
): Promise<ScopeView[]> {
  const ids = sides.flatMap(({ input }) =>
    [
      input.panelProductId,
      ...inverterPicks(input).map((pick) => pick.productId),
      input.batteryProductId,
    ].flatMap((id) => (id ? [id] : [])),
  );
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  const named = (id: string | null | undefined) => {
    const row = rows.find((product) => product.id === id);
    if (!row) return '';
    return row.brand === 'Starter catalog' ? row.name : `${row.brand} ${row.name}`;
  };
  return sides.map(({ input, totals }) => ({
    capacityWp: totals.capacityWp,
    moduleCount: totals.moduleCount,
    panel: {
      name: named(input.panelProductId),
      dcr: rows.find((row) => row.id === input.panelProductId)?.dcr ?? false,
    },
    inverter: inverterSummary(inverterPicks(input), named),
    battery: input.batteryProductId ? named(input.batteryProductId) : null,
    structureType: input.structureType,
    extras: (input.extras ?? []).map((line) => line.description),
  }));
}
