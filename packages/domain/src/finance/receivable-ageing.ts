/** Ageing buckets for money owed, counted from the day it fell due. */
export const AGEING_BUCKETS = ['current', 'days_31_60', 'days_61_90', 'days_over_90'] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export function ageingBucket(daysSinceDue: number): AgeingBucket {
  if (daysSinceDue <= 30) return 'current';
  if (daysSinceDue <= 60) return 'days_31_60';
  if (daysSinceDue <= 90) return 'days_61_90';
  return 'days_over_90';
}

/** Indian financial year (April to March) for a calendar date: 2026-11-02 → "2026-27". */
export function financialYear(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}
