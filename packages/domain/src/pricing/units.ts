/**
 * The units a quantity can be counted in. A fixed list, not free text, so the same thing
 * is never "m", "mtr" and "meter" in different places and quantities add up correctly.
 */
export const UNITS = [
  'nos',
  'pair',
  'set',
  'm',
  'kg',
  'kW',
  'kW·floor',
  'job',
  'day',
  'trip',
  'lot',
] as const;
export type Unit = (typeof UNITS)[number];

/** How each unit reads in a list. */
export const UNIT_LABELS: Readonly<Record<Unit, string>> = {
  nos: 'nos (pieces)',
  pair: 'pair',
  set: 'set',
  m: 'm (metre)',
  kg: 'kg',
  kW: 'kW',
  kW·floor: 'kW per floor',
  job: 'job',
  day: 'day',
  trip: 'trip',
  lot: 'lot',
};

export const isUnit = (value: string): value is Unit =>
  (UNITS as readonly string[]).includes(value);

/** A saved unit read back as one from the list; anything else (older free text) reads as "nos". */
export const asUnit = (value: string): Unit => (isUnit(value) ? value : 'nos');
