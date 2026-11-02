/**
 * A quotation can carry several inverters: more of one model ("3 × 10 kW") or a mix
 * ("50 kW + 30 kW"). Each pick is one model and how many of it.
 */
export interface InverterPick {
  readonly productId: string;
  readonly quantity: number;
}

/** Most inverters a quotation may list, and most of one model. */
export const MAX_INVERTER_MODELS = 10;
export const MAX_INVERTERS_PER_MODEL = 50;

/**
 * The inverter picks of an input. Older clients send one `inverterProductId`; that reads
 * as one inverter. The same model picked twice is counted once, in the first row's place.
 */
export function inverterPicks(input: {
  readonly inverters?: readonly InverterPick[] | null | undefined;
  readonly inverterProductId?: string | null | undefined;
}): InverterPick[] {
  const rows =
    input.inverters && input.inverters.length > 0
      ? input.inverters
      : input.inverterProductId
        ? [{ productId: input.inverterProductId, quantity: 1 }]
        : [];
  const merged = new Map<string, number>();
  for (const row of rows) {
    if (row.quantity <= 0) continue;
    merged.set(row.productId, (merged.get(row.productId) ?? 0) + row.quantity);
  }
  return [...merged].map(([productId, quantity]) => ({ productId, quantity }));
}

/** The main inverter: the first one picked. Older single-inverter readers use it. */
export function mainInverterId(picks: readonly InverterPick[]): string | null {
  return picks[0]?.productId ?? null;
}

/** Quote line key of the inverter in that place: `inverter`, then `inverter_2`, `inverter_3`… */
export function inverterLineKey(index: number): string {
  return index === 0 ? 'inverter' : `inverter_${index + 1}`;
}

export const isInverterLineKey = (key: string): boolean =>
  key === 'inverter' || /^inverter_\d+$/.test(key);

/** Same models and counts, in any order. */
export function samePicks(left: readonly InverterPick[], right: readonly InverterPick[]): boolean {
  const text = (picks: readonly InverterPick[]) =>
    picks
      .map((pick) => `${pick.productId}:${pick.quantity}`)
      .sort()
      .join(',');
  return text(left) === text(right);
}

/** Total AC rating in watts; a model without a rating adds nothing. */
export function inverterTotalW(
  picks: readonly InverterPick[],
  ratedW: (productId: string) => number | null | undefined,
): number {
  return picks.reduce((sum, pick) => sum + (ratedW(pick.productId) ?? 0) * pick.quantity, 0);
}

/** "Brand A 5 kW × 2, Brand B 3 kW": how people and DISCOM forms name the inverters. */
export function inverterSummary(
  picks: readonly InverterPick[],
  name: (productId: string) => string,
): string {
  return picks
    .map((pick) =>
      pick.quantity > 1 ? `${name(pick.productId)} × ${pick.quantity}` : name(pick.productId),
    )
    .join(', ');
}

export type InverterFit = 'ok' | 'small' | 'large' | 'unknown';

/**
 * Do the inverters carry the array? DC up to 130% of AC is normal (overloading); more
 * than that clips power. AC above 120% of DC pays for capacity the panels never use.
 * A warning only: sales may still have a reason.
 */
export function inverterFit(capacityWp: number, inverterW: number): InverterFit {
  if (capacityWp <= 0 || inverterW <= 0) return 'unknown';
  if (capacityWp > inverterW * 1.3) return 'small';
  if (inverterW > capacityWp * 1.2) return 'large';
  return 'ok';
}

/** Most units a suggestion fills the rest with before one more large inverter is simpler. */
const MAX_FILL_UNITS = 4;

/**
 * Inverters for an array of `targetWp`, from models best-first at each rating:
 * 1. one model when one carries the array (DC up to `headroom` × AC);
 * 2. else as many of the largest model as the array fills;
 * 3. the rest by one smaller model that carries it, or a few smaller ones adding less
 *    than one more of the largest;
 * 4. else one more of the largest.
 * 120 kW from 25 and 50 kW models: 2 × 50 + 1 × 25. 115 kW from 5 and 50 kW: 2 × 50 + 3 × 5.
 */
export function suggestInverterMix(
  models: readonly { readonly id: string; readonly ratedW: number }[],
  targetWp: number,
  headroom = 1.1,
): InverterPick[] {
  const sized = models
    .filter((model) => model.ratedW > 0)
    .sort((left, right) => left.ratedW - right.ratedW);
  const carries = (watts: number) => sized.find((model) => model.ratedW * headroom >= watts);
  // The preferred model at the top rating: models come best-first within a rating.
  const top = sized.at(-1)?.ratedW;
  const largest = sized.find((model) => model.ratedW === top);
  if (!largest) return [];
  const single = carries(targetWp);
  if (single) return [{ productId: single.id, quantity: 1 }];

  let remaining = targetWp;
  let count = 0;
  while (remaining > largest.ratedW * headroom && count < MAX_INVERTERS_PER_MODEL) {
    remaining -= largest.ratedW;
    count += 1;
  }
  const smaller = sized.filter((model) => model.ratedW < largest.ratedW);
  const one = carries(remaining);
  const filled =
    one?.id === largest.id && smaller.length > 0
      ? suggestInverterMix(smaller, remaining, headroom)
      : [];
  const units = filled.reduce((sum, pick) => sum + pick.quantity, 0);
  const filledW = filled.reduce(
    (sum, pick) =>
      sum + (sized.find((model) => model.id === pick.productId)?.ratedW ?? 0) * pick.quantity,
    0,
  );
  // Smaller ones only when they are few and add less than one more of the largest.
  const fillIsBetter = filled.length > 0 && units <= MAX_FILL_UNITS && filledW < largest.ratedW;
  const rest: InverterPick[] =
    one && one.id !== largest.id
      ? [{ productId: one.id, quantity: 1 }]
      : fillIsBetter
        ? filled
        : [{ productId: largest.id, quantity: 1 }];
  return inverterPicks({
    inverters: [{ productId: largest.id, quantity: count }, ...rest],
  }).slice(0, MAX_INVERTER_MODELS);
}
