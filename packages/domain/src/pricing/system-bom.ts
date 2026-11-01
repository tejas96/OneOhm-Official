import { line, priced, rateLines, STAGE, type Staged, TRAVEL_STAGE } from './bom-lines';
import { cableNeeds, cableRuns } from './cable-estimate';
import type { CostingCard } from './costing-card';
import { type CostingDetail, countOf, type RateNeed, type UsedDetail } from './costing-detail';
import { labourEstimate } from './labour-estimate';
import type { QuoteLineInput } from './quote-pricing';
import type { PanelProduct, PricedProduct, SiteFacts } from './rate-card';
import { structureEstimate } from './structure-bom';

export interface SystemDesignInput {
  readonly targetWp: number;
  readonly panel: PanelProduct;
  readonly inverter: PricedProduct;
  readonly battery?: PricedProduct | undefined;
  readonly site: SiteFacts;
  readonly rates: CostingCard;
  /** What the survey or a manager set beyond the quick quote; the rest is defaults. */
  readonly detail?: CostingDetail | null | undefined;
}

export interface SystemDesign {
  readonly moduleCount: number;
  readonly capacityWp: number;
  readonly lines: readonly QuoteLineInput[];
  readonly used: UsedDetail;
}

/**
 * The central cost engine (PRD 3.9 D, Flow F): equipment BOM → structure BOM → cable
 * estimate → electrical → labour, equipment and travel → services, one line per rate
 * line with its catalog product. Without survey measurements, quantities come from the
 * site type's defaults and carry contingency. Lines are priced from their rates, or from
 * cost plus overhead and the target margin when the card says so.
 */
export function designSystem(input: SystemDesignInput): SystemDesign {
  const { panel, site, rates } = input;
  const detail = input.detail ?? undefined;
  const moduleCount = Math.max(1, Math.ceil(input.targetWp / panel.wattageWp));
  const capacityWp = moduleCount * panel.wattageWp;
  const kw = capacityWp / 1000;
  const setup = rates.sites[site.structureType];
  const structure = structureEstimate({
    site: setup,
    panels: moduleCount,
    kw,
    detail: detail?.structure,
  });
  const runs = cableRuns({
    site: setup,
    floors: site.floors,
    wastageBp: rates.wastageBp,
    measured: measuredTotals(site),
    runs: detail?.runs,
  });
  const labour = labourEstimate({
    card: rates,
    site: setup,
    kw,
    floors: site.floors,
    distanceKm: site.distanceKm,
    detail,
  });
  const size = { kw, panels: moduleCount, rows: structure.used.rows };
  const jobNeeds: RateNeed[] = rates.jobItems.map((item) => ({
    rate: item.rate,
    quantity: item.qty * countOf(item.per, size),
    basis: 'catalog',
  }));
  const needs = [...structure.needs, ...cableNeeds(runs), ...jobNeeds, ...labour.needs];
  const staged: Staged[] = [
    ...rateLines(rates, needs, labour.used.access),
    ...(structure.perKw
      ? [
          {
            stage: STAGE.structure,
            order: -1,
            line: line('structure', setup.label, 'structure', structure.perKw.quantity, 'kW', {
              price: structure.perKw.pricePaise,
              cost: structure.perKw.costPaise,
              tax: rates.goodsTaxBp,
              basis: structure.perKw.basis,
            }),
          },
        ]
      : []),
    ...(labour.used.visits > 0
      ? [
          {
            stage: TRAVEL_STAGE,
            order: 0,
            line: line('transport', rates.travel.label, 'transport', labour.used.visits, 'trip', {
              price: labour.used.tripPaise,
              cost: labour.used.tripPaise,
              tax: rates.serviceTaxBp,
              basis: 'default',
            }),
          },
        ]
      : []),
  ];
  const ordered = staged
    .sort((left, right) => left.stage - right.stage || left.order - right.order)
    .map((entry) => entry.line);
  const lines = [...equipmentLines(input, moduleCount), ...ordered].map((entry) =>
    priced(rates, entry),
  );
  return {
    moduleCount,
    capacityWp,
    lines,
    used: { runs, structure: structure.used, ...labour.used },
  };
}

/** Cable totals the quick quote measured, by kind of route. */
function measuredTotals(site: SiteFacts): Partial<Record<'dc' | 'ac', number>> {
  return {
    ...(site.dcCableMeters === undefined ? {} : { dc: site.dcCableMeters }),
    ...(site.acCableMeters === undefined ? {} : { ac: site.acCableMeters }),
  };
}

/** Panels, inverter and battery from the catalog, each naming its product. */
function equipmentLines(input: SystemDesignInput, moduleCount: number): QuoteLineInput[] {
  const { panel, inverter, battery } = input;
  const catalog = (
    key: 'panel' | 'inverter' | 'battery',
    product: PricedProduct,
    quantity: number,
    name: string,
  ) =>
    line(key, name, key, quantity, product.unit, {
      price: product.pricePaise,
      cost: product.costPaise,
      tax: product.taxRateBp,
      basis: 'catalog',
      productId: product.id,
    });
  return [
    catalog(
      'panel',
      panel,
      moduleCount,
      `${panel.name} (${panel.wattageWp} Wp${panel.dcr ? ', DCR' : ''})`,
    ),
    catalog('inverter', inverter, 1, inverter.name),
    ...(battery ? [catalog('battery', battery, 1, battery.name)] : []),
  ];
}
