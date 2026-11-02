import type {
  QuotationCosting,
  QuotationPreviewInput,
  QuotationTotals,
} from '@oneohm/api-contracts';
import {
  asUnit,
  type CostBuildup,
  calculateSubsidy,
  costBuildup,
  designSystem,
  type ExtraLine,
  extraQuoteLines,
  type PanelProduct,
  type PricedLine,
  type PricedProduct,
  priceQuote,
  type RateCard,
  type StateTopUpRule,
  type SubsidyRule,
  type UsedDetail,
} from '@oneohm/domain';
import type { SiteFacts } from './site-facts';
import { stateSupportFor } from './state-support-line';

/** Everything one price needs: the inputs, products, hand-added lines, rates and rule. */
export interface QuoteParts {
  readonly input: QuotationPreviewInput;
  readonly site: SiteFacts;
  readonly panel: PanelProduct;
  /** Each inverter model with how many of it, in the order picked. */
  readonly inverters: readonly { readonly product: PricedProduct; readonly quantity: number }[];
  readonly battery: PricedProduct | undefined;
  readonly extras: readonly ExtraLine[];
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
  /** The state's low-income top-up in force (null: none, so ₹0 as before). */
  readonly stateRule?: StateTopUpRule | null;
}

/** A priced line with what was said about a hand-added one. */
export type QuotedLine = PricedLine & {
  readonly reason: string | null;
  readonly productId: string | null;
};

export interface QuoteResult {
  readonly totals: QuotationTotals;
  readonly lines: readonly QuotedLine[];
  /** The discount plus any downward adjustment: what the approval limit is checked on. */
  readonly reductionPaise: number;
  /** Cable runs, structure, crew and visits the engine used. */
  readonly used: UsedDetail;
  /** Material, labour, equipment, travel, overhead and margin (PRD 3.9 D). */
  readonly build: CostBuildup;
}

/** Bill of materials, price and subsidy for one panel choice and discount (PRD 3.5, 3.9). */
export function quoteTotals(parts: QuoteParts, discountPaise: number): QuoteResult {
  const { input, site, rates } = parts;
  const design = designSystem({
    targetWp: input.targetWp,
    panel: parts.panel,
    inverters: parts.inverters,
    battery: parts.battery,
    site: {
      floors: input.floors,
      structureType: input.structureType,
      distanceKm: input.distanceKm,
      dcCableMeters: input.dcCableMeters ?? undefined,
      acCableMeters: input.acCableMeters ?? undefined,
    },
    rates,
    detail: input.costing,
  });
  const pricing = priceQuote([...design.lines, ...extraQuoteLines(parts.extras)], {
    contingencyBp: rates.contingencyBp,
    discountPaise,
  });
  const subsidy = calculateSubsidy(
    {
      category: input.subsidyCategory,
      capacityWp: design.capacityWp,
      panelsDcr: parts.panel.dcr,
      systemType: input.systemType,
      households: input.households ?? site.households ?? undefined,
      meterInSocietyName: site.meterInSocietyName ?? undefined,
      propertyAlreadySubsidised: site.subsidyClaimed,
    },
    parts.rule,
  );
  const state = stateSupportFor(parts, design.capacityWp, subsidy);
  const engineLines = design.lines.length;
  const extraInputs = input.extras ?? [];
  const lines = pricing.lines.map((line, index): QuotedLine => {
    const extra = index >= engineLines ? extraInputs[index - engineLines] : undefined;
    return {
      ...line,
      reason: extra?.reason || null,
      productId: line.productId ?? extra?.productId ?? null,
    };
  });
  return {
    totals: {
      moduleCount: design.moduleCount,
      capacityWp: design.capacityWp,
      subtotalPaise: pricing.subtotalPaise,
      contingencyPaise: pricing.contingencyPaise,
      discountPaise: pricing.discountPaise,
      taxPaise: pricing.taxPaise,
      totalPaise: pricing.totalPaise,
      costPaise: pricing.costPaise,
      marginPaise: pricing.marginPaise,
      subsidyPaise: subsidy.amountPaise,
      subsidyIneligible: subsidy.ineligible,
      effectivePaise: Math.max(0, pricing.totalPaise - subsidy.amountPaise - state.amountPaise),
      optionalPaise: pricing.optionalPaise,
      stateSupportPaise: state.amountPaise,
      stateSupportIneligible: state.ineligible,
    },
    lines,
    reductionPaise: pricing.reductionPaise,
    used: design.used,
    build: costBuildup(rates, pricing.lines),
  };
}

/** How the price was reached, for the people who see cost (PRD 3.9 success condition). */
export function costingView(rates: RateCard, result: QuoteResult): QuotationCosting {
  return {
    build: result.build,
    used: result.used as QuotationCosting['used'],
    rates: rates.rateLines.map(({ key, label, kind, unit }) => ({
      key,
      label,
      kind,
      unit: asUnit(unit),
    })),
    pricingMode: rates.pricing.mode,
  };
}
