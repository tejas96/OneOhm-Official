import type { QuoteLineInput } from './quote-pricing';
import type { PanelProduct, PricedProduct, RateCard, SiteFacts, StructureType } from './rate-card';

export interface SystemDesignInput {
  readonly targetWp: number;
  readonly panel: PanelProduct;
  readonly inverter: PricedProduct;
  readonly battery?: PricedProduct | undefined;
  readonly site: SiteFacts;
  readonly rates: RateCard;
}

export interface SystemDesign {
  readonly moduleCount: number;
  readonly capacityWp: number;
  readonly lines: readonly QuoteLineInput[];
}

const goods = (rates: RateCard) => rates.goodsTaxBp;

/**
 * Turns a target size and the chosen products into a full bill of materials: panels,
 * inverter, structure, cables, protection, labour, transport and DISCOM work. Without
 * survey measurements, cable runs come from site-type defaults and carry contingency.
 */
export function designSystem(input: SystemDesignInput): SystemDesign {
  const { panel, inverter, battery, site, rates } = input;
  const moduleCount = Math.max(1, Math.ceil(input.targetWp / panel.wattageWp));
  const capacityWp = moduleCount * panel.wattageWp;
  const kw = capacityWp / 1000;
  const structure = rates.structurePerKw[site.structureType];
  const floorsAbove = Math.max(0, site.floors - rates.freeFloors);
  const dcMeters =
    site.dcCableMeters ?? rates.dcCable.baseMeters + site.floors * rates.dcCable.perFloorMeters;
  const acMeters =
    site.acCableMeters ?? rates.acCable.baseMeters + site.floors * rates.acCable.perFloorMeters;
  // Each run is measured on its own: a measured DC run never makes the AC estimate exact.
  const dcBasis = site.dcCableMeters === undefined ? 'default' : 'survey';
  const acBasis = site.acCableMeters === undefined ? 'default' : 'survey';
  const extraKm = Math.max(0, site.distanceKm - rates.transport.baseKm);

  const lines: QuoteLineInput[] = [
    line(
      'panel',
      `${panel.name} (${panel.wattageWp} Wp${panel.dcr ? ', DCR' : ''})`,
      'panel',
      moduleCount,
      panel.unit,
      panel.pricePaise,
      panel.costPaise,
      panel.taxRateBp,
      'catalog',
    ),
    line(
      'inverter',
      inverter.name,
      'inverter',
      1,
      inverter.unit,
      inverter.pricePaise,
      inverter.costPaise,
      inverter.taxRateBp,
      'catalog',
    ),
    ...(battery
      ? [
          line(
            'battery',
            battery.name,
            'battery',
            1,
            battery.unit,
            battery.pricePaise,
            battery.costPaise,
            battery.taxRateBp,
            'catalog',
          ),
        ]
      : []),
    line(
      'structure',
      structureName(site.structureType),
      'structure',
      kw,
      'kW',
      structure.price,
      structure.cost,
      goods(rates),
      'default',
    ),
    line(
      'dc_cable',
      'DC cable (4 sq mm, solar grade)',
      'cable',
      dcMeters,
      'm',
      rates.dcCable.price,
      rates.dcCable.cost,
      goods(rates),
      dcBasis,
    ),
    line(
      'ac_cable',
      'AC cable (copper, armoured)',
      'cable',
      acMeters,
      'm',
      rates.acCable.price,
      rates.acCable.cost,
      goods(rates),
      acBasis,
    ),
    line(
      'earthing',
      'Earthing kit (3 pits) and lightning arrester',
      'electrical',
      1,
      'set',
      rates.earthingKit.price,
      rates.earthingKit.cost,
      goods(rates),
      'catalog',
    ),
    line(
      'protection',
      'ACDB / DCDB with SPD and MCBs',
      'electrical',
      1,
      'set',
      rates.protectionKit.price,
      rates.protectionKit.cost,
      goods(rates),
      'catalog',
    ),
    line(
      'installation',
      'Installation and commissioning',
      'installation',
      kw,
      'kW',
      rates.installationPerKw.price,
      rates.installationPerKw.cost,
      rates.serviceTaxBp,
      'catalog',
    ),
    ...(floorsAbove > 0
      ? [
          line(
            'extra_floor',
            `Extra effort above floor ${rates.freeFloors}`,
            'installation',
            kw * floorsAbove,
            'kW·floor',
            rates.extraFloorPerKw.price,
            rates.extraFloorPerKw.cost,
            rates.serviceTaxBp,
            'default',
          ),
        ]
      : []),
    line(
      'transport',
      'Transport to site',
      'transport',
      1,
      'trip',
      rates.transport.flat + extraKm * rates.transport.perKm,
      rates.transport.flat + extraKm * rates.transport.perKm,
      rates.serviceTaxBp,
      'default',
    ),
    line(
      'liaisoning',
      'DISCOM net-metering application and liaisoning',
      'liaisoning',
      1,
      'job',
      rates.liaisoning.price,
      rates.liaisoning.cost,
      rates.serviceTaxBp,
      'catalog',
    ),
  ];
  return { moduleCount, capacityWp, lines };
}

function line(
  key: string,
  description: string,
  category: QuoteLineInput['category'],
  quantity: number,
  unit: string,
  unitPricePaise: number,
  unitCostPaise: number,
  taxRateBp: number,
  basis: QuoteLineInput['basis'],
): QuoteLineInput {
  return {
    key,
    description,
    category,
    quantity: round2(quantity),
    unit,
    unitPricePaise,
    unitCostPaise,
    taxRateBp,
    basis,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function structureName(type: StructureType): string {
  if (type === 'tin_shed') return 'Mounting structure on tin shed (aluminium rail)';
  if (type === 'ground_mount') return 'Ground-mount structure with foundations';
  return 'Elevated RCC-roof structure (galvanised steel)';
}
