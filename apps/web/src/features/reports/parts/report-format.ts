'use client';

import type { ReportMeta } from '@oneohm/api-contracts';
import { formatInrCompact, formatKwp } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';

type Bucket = ReportMeta['buckets'][number];
const at = (date: string) => new Date(`${date}T00:00:00`);

/** Names and ticks for report buckets: "Week of 2 Nov" / "2 Nov", "November 2026" / "Nov". */
export function useBucketNames(granularity: ReportMeta['granularity']) {
  const t = useTranslations('businessReports.bucket');
  const format = useFormatter();
  return {
    name: (bucket: Bucket) =>
      granularity === 'week'
        ? t('week', { date: format.dateTime(at(bucket.start), { day: 'numeric', month: 'short' }) })
        : format.dateTime(at(bucket.start), { month: 'long', year: 'numeric' }),
    tick: (bucket: Bucket) =>
      granularity === 'week'
        ? format.dateTime(at(bucket.start), { day: 'numeric', month: 'short' })
        : format.dateTime(at(bucket.start), { month: 'short' }),
  };
}

/** A 0–1 rate as a whole percent; a dash when there is nothing to divide. */
export const formatRate = (rate: number | null) =>
  rate === null ? '–' : `${Math.round(rate * 100)}%`;

export const money = (paise: number) => formatInrCompact(paise);
export const kwp = (watts: number) => formatKwp(watts);
export const whole = (value: number) => Math.round(value).toLocaleString('en-IN');
/** Days or hours with one decimal at most; a dash when unknown. */
export const decimal = (value: number | null) =>
  value === null ? '–' : (Math.round(value * 10) / 10).toLocaleString('en-IN');
