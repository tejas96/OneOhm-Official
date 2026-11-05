const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** The what-is-wrong choices of the problem report, in the order they are listed. */
export const PROBLEM_KINDS = [
  'inverter',
  'nopower',
  'lowpower',
  'damage',
  'cleaning',
  'bill',
  'other',
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];
export const SINCE_CHOICES = ['today', 'week', 'longer'] as const;
export type Since = (typeof SINCE_CHOICES)[number];

const WORD = new RegExp(
  `^(?:pb:(what|since):([a-z]{3,10})|pb:done|rt:(go):(${UUID})|rt:(${UUID}):([1-5])|fx:(y|n):(${UUID})|rf:city:([^:]{1,60})|rf:link|up:go:(${UUID})|amc:(renew|talk):(${UUID}))$`,
);

/** A tap of the problem report, the rating, the fixed check, the referral or the UPI ask. */
export type CareTap =
  | { readonly t: 'what'; readonly value: ProblemKind }
  | { readonly t: 'since'; readonly value: Since }
  | { readonly t: 'done' }
  | { readonly t: 'rateGo'; readonly id: string }
  | { readonly t: 'rate'; readonly id: string; readonly stars: number }
  | { readonly t: 'fixed'; readonly id: string; readonly working: boolean }
  | { readonly t: 'city'; readonly value: string }
  | { readonly t: 'link' }
  | { readonly t: 'upi'; readonly id: string }
  | { readonly t: 'amc'; readonly id: string; readonly renew: boolean };

export function readCareTap(id: string | null | undefined): CareTap | null {
  const m = WORD.exec(id ?? '');
  if (!m) return null;
  const [, kind, value, go, goId, rateId, stars, fixed, fixedId, city, upi, amc, amcId] = m;
  if (kind === 'what' && (PROBLEM_KINDS as readonly string[]).includes(value ?? ''))
    return { t: 'what', value: value as ProblemKind };
  if (kind === 'since' && (SINCE_CHOICES as readonly string[]).includes(value ?? ''))
    return { t: 'since', value: value as Since };
  if (id === 'pb:done') return { t: 'done' };
  if (go && goId) return { t: 'rateGo', id: goId };
  if (rateId && stars) return { t: 'rate', id: rateId, stars: Number(stars) };
  if (fixed && fixedId) return { t: 'fixed', id: fixedId, working: fixed === 'y' };
  if (city) return { t: 'city', value: city };
  if (id === 'rf:link') return { t: 'link' };
  if (upi) return { t: 'upi', id: upi };
  if (amc && amcId) return { t: 'amc', id: amcId, renew: amc === 'renew' };
  return null;
}

export const isCareTap = (id: string) => readCareTap(id) !== null;

export const careTaps = {
  what: (value: ProblemKind) => `pb:what:${value}`,
  since: (value: Since) => `pb:since:${value}`,
  done: 'pb:done',
  rateGo: (id: string) => `rt:go:${id}`,
  rate: (id: string, stars: number) => `rt:${id}:${stars}`,
  fixedYes: (id: string) => `fx:y:${id}`,
  fixedNo: (id: string) => `fx:n:${id}`,
  city: (value: string) => `rf:city:${value.slice(0, 60)}`,
  link: 'rf:link',
  upi: (id: string) => `up:go:${id}`,
  amcRenew: (id: string) => `amc:renew:${id}`,
  amcTalk: (id: string) => `amc:talk:${id}`,
} as const;
