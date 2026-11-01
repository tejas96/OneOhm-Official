import { addDays, daysBetween } from '@oneohm/shared';

/**
 * What a commissioned system is made of, for warranty and service (PRD 3.17). The
 * installation itself is recorded too, so the workmanship warranty has a home.
 */
export const ASSET_KINDS = ['panel', 'inverter', 'battery', 'structure', 'workmanship'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Years of cover for one kind; panels also carry a longer performance warranty. */
export interface WarrantyTerm {
  readonly years: number;
  readonly performanceYears: number | null;
}

export type WarrantyPolicy = Readonly<Record<AssetKind, WarrantyTerm>>;

/** Typical cover in the Indian rooftop market; owners change it in Settings. */
export const DEFAULT_WARRANTY_POLICY: WarrantyPolicy = {
  panel: { years: 10, performanceYears: 25 },
  inverter: { years: 5, performanceYears: null },
  battery: { years: 5, performanceYears: null },
  structure: { years: 5, performanceYears: null },
  workmanship: { years: 1, performanceYears: null },
};

/** The longest cover anyone can set, in years. */
export const MAX_WARRANTY_YEARS = 40;

const pad = (value: number) => String(value).padStart(2, '0');

/** The same day `months` later; a day the month lacks (31 Feb) becomes its last day. */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  if (!year || !month || !day) throw new Error(`Not a calendar date: ${date}`);
  const index = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(index / 12);
  const nextMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(nextYear, nextMonth, 0)).getUTCDate();
  return `${nextYear}-${pad(nextMonth)}-${pad(Math.min(day, lastDay))}`;
}

/** The last covered day: one day before the anniversary. Zero years is no cover. */
export function coverEnds(startsOn: string, years: number): string {
  return addDays(addMonths(startsOn, years * 12), -1);
}

export interface WarrantyDates {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly performanceEndsOn: string | null;
}

/** Cover for one installed item, starting on the commissioning date. */
export function warrantyFor(
  kind: AssetKind,
  startsOn: string,
  policy: WarrantyPolicy = DEFAULT_WARRANTY_POLICY,
): WarrantyDates {
  const term = policy[kind];
  return {
    startsOn,
    endsOn: coverEnds(startsOn, term.years),
    performanceEndsOn:
      term.performanceYears === null ? null : coverEnds(startsOn, term.performanceYears),
  };
}

export type WarrantyState = 'active' | 'ending_soon' | 'ended';

/** Cover ending within this many days is flagged so the team can offer an AMC. */
export const WARRANTY_SOON_DAYS = 90;

export function warrantyState(endsOn: string, today: string): WarrantyState {
  const left = daysBetween(today, endsOn);
  if (left < 0) return 'ended';
  return left <= WARRANTY_SOON_DAYS ? 'ending_soon' : 'active';
}
