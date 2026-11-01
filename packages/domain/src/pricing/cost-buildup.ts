import { type CostingCard, rateLineOf } from './costing-card';
import type { LineCategory, PricedLine } from './quote-pricing';

const BP = 10_000;
const toRupee = (paise: number) => Math.round(paise / 100) * 100;

/**
 * How the price was reached (PRD 3.9 D, "management sees exactly how the price was
 * calculated"): material + labour + equipment + travel + services is the direct cost,
 * overhead goes on top, and what the customer pays before GST less all of it is the margin.
 */
export interface CostBuildup {
  readonly materialPaise: number;
  readonly labourPaise: number;
  readonly equipmentPaise: number;
  readonly travelPaise: number;
  readonly servicesPaise: number;
  readonly directCostPaise: number;
  readonly overheadPaise: number;
  readonly fullCostPaise: number;
  /** The price before GST, after any discount. */
  readonly netPricePaise: number;
  readonly marginPaise: number;
  readonly marginBp: number;
}

type Bucket = 'materialPaise' | 'labourPaise' | 'equipmentPaise' | 'travelPaise' | 'servicesPaise';

const MATERIAL: ReadonlySet<LineCategory> = new Set([
  'panel',
  'inverter',
  'battery',
  'structure',
  'cable',
  'electrical',
]);

function bucketOf(card: CostingCard, line: PricedLine): Bucket {
  const kind = line.extra ? undefined : rateLineOf(card, line.key)?.kind;
  if (kind === 'equipment') return 'equipmentPaise';
  if (kind === 'labour') return 'labourPaise';
  if (MATERIAL.has(line.category)) return 'materialPaise';
  if (line.category === 'installation') return 'labourPaise';
  if (line.category === 'transport') return 'travelPaise';
  return 'servicesPaise';
}

/** The cost build-up of priced lines; optional items are only offered, so they are left out. */
export function costBuildup(card: CostingCard, lines: readonly PricedLine[]): CostBuildup {
  const parts: Record<Bucket, number> = {
    materialPaise: 0,
    labourPaise: 0,
    equipmentPaise: 0,
    travelPaise: 0,
    servicesPaise: 0,
  };
  let netPricePaise = 0;
  for (const line of lines) {
    if (line.extra === 'optional') continue;
    parts[bucketOf(card, line)] += line.costPaise;
    netPricePaise += line.totalPaise - line.taxPaise;
  }
  const directCostPaise = Object.values(parts).reduce((sum, value) => sum + value, 0);
  const overheadPaise = toRupee((directCostPaise * card.overheadBp) / BP);
  const fullCostPaise = directCostPaise + overheadPaise;
  const marginPaise = netPricePaise - fullCostPaise;
  return {
    ...parts,
    directCostPaise,
    overheadPaise,
    fullCostPaise,
    netPricePaise,
    marginPaise,
    marginBp: netPricePaise > 0 ? Math.round((marginPaise * BP) / netPricePaise) : 0,
  };
}

/** Person-days of crew labour on priced lines: what a contractor's day rate is paid for. */
export function personDays(
  card: CostingCard,
  lines: readonly { readonly key: string; readonly quantity: number; readonly unit: string }[],
): number {
  return lines.reduce((sum, line) => {
    const rate = rateLineOf(card, line.key);
    return rate?.kind === 'labour' && /day/i.test(rate.unit) ? sum + line.quantity : sum;
  }, 0);
}
