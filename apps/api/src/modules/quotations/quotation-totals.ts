import type { QuotationPreviewInput, QuotationTotals } from '@oneohm/api-contracts';
import {
  calculateSubsidy,
  designSystem,
  type ExtraLine,
  extraQuoteLines,
  type PanelProduct,
  type PricedLine,
  type PricedProduct,
  priceQuote,
  type RateCard,
  type SubsidyRule,
} from '@oneohm/domain';
import type { SiteFacts } from './site-facts';

/** Everything one price needs: the inputs, products, hand-added lines, rates and rule. */
export interface QuoteParts {
  readonly input: QuotationPreviewInput;
  readonly site: SiteFacts;
  readonly panel: PanelProduct;
  readonly inverter: PricedProduct;
  readonly battery: PricedProduct | undefined;
  readonly extras: readonly ExtraLine[];
  readonly rates: RateCard;
  readonly rule: SubsidyRule | null;
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
}

/** Bill of materials, price and subsidy for one panel choice and discount (PRD 3.5, 3.9). */
export function quoteTotals(parts: QuoteParts, discountPaise: number): QuoteResult {
  const { input, site, rates } = parts;
  const design = designSystem({
    targetWp: input.targetWp,
    panel: parts.panel,
    inverter: parts.inverter,
    battery: parts.battery,
    site: {
      floors: input.floors,
      structureType: input.structureType,
      distanceKm: input.distanceKm,
      dcCableMeters: input.dcCableMeters ?? undefined,
      acCableMeters: input.acCableMeters ?? undefined,
    },
    rates,
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
  const engineLines = design.lines.length;
  const extraInputs = input.extras ?? [];
  const lines = pricing.lines.map((line, index): QuotedLine => {
    const extra = index >= engineLines ? extraInputs[index - engineLines] : undefined;
    return { ...line, reason: extra?.reason || null, productId: extra?.productId ?? null };
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
      effectivePaise: Math.max(0, pricing.totalPaise - subsidy.amountPaise),
      optionalPaise: pricing.optionalPaise,
    },
    lines,
    reductionPaise: pricing.reductionPaise,
  };
}
