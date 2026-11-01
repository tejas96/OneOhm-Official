import { addDays } from '@oneohm/shared';

/** The periods every report and the command centre can show. */
export const REPORT_PERIODS = ['this_month', 'last_30_days', 'this_quarter', 'this_year'] as const;
export type ReportPeriodName = (typeof REPORT_PERIODS)[number];
export type ReportGranularity = 'week' | 'month';

export interface ReportRange {
  readonly start: string;
  readonly end: string;
}

/** One bucket of a report: an ISO week (Monday–Sunday) or a calendar month, clipped to the range. */
export interface ReportBucket {
  readonly start: string;
  readonly end: string;
}

/**
 * The days a period covers, ending today. India's financial year starts in April; its
 * quarters are Apr–Jun, Jul–Sep, Oct–Dec and Jan–Mar.
 */
export function reportRange(period: ReportPeriodName, today: string): ReportRange {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  switch (period) {
    case 'last_30_days':
      return { start: addDays(today, -29), end: today };
    case 'this_quarter': {
      const first = month - ((month - 1) % 3);
      return { start: `${year}-${String(first).padStart(2, '0')}-01`, end: today };
    }
    case 'this_year':
      return { start: month >= 4 ? `${year}-04-01` : `${year - 1}-04-01`, end: today };
    default:
      return { start: `${today.slice(0, 8)}01`, end: today };
  }
}

/** Weeks for a month or less, months for anything longer. */
export function granularityFor(range: ReportRange): ReportGranularity {
  const days = (Date.parse(range.end) - Date.parse(range.start)) / 86_400_000 + 1;
  return days <= 31 ? 'week' : 'month';
}

const isoWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};

function bucketStart(date: string, granularity: ReportGranularity): string {
  if (granularity === 'week') return addDays(date, 1 - isoWeekday(date));
  return `${date.slice(0, 7)}-01`;
}

function nextBucketStart(start: string, granularity: ReportGranularity): string {
  if (granularity === 'week') return addDays(start, 7);
  const year = Number(start.slice(0, 4));
  const month = Number(start.slice(5, 7));
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** The weeks or months that make up the range, oldest first, each clipped to the range. */
export function reportBuckets(range: ReportRange, granularity: ReportGranularity): ReportBucket[] {
  const buckets: ReportBucket[] = [];
  let start = bucketStart(range.start, granularity);
  while (start <= range.end) {
    const next = nextBucketStart(start, granularity);
    const end = addDays(next, -1);
    buckets.push({
      start: start < range.start ? range.start : start,
      end: end > range.end ? range.end : end,
    });
    start = next;
  }
  return buckets;
}

/** Index of the bucket a date falls in, or -1 outside the range. */
export function bucketIndexOf(buckets: readonly ReportBucket[], date: string): number {
  return buckets.findIndex((bucket) => date >= bucket.start && date <= bucket.end);
}

/** On time ÷ finished, or null when nothing finished (shown as a dash, never 0%). */
export function onTimeRate(onTime: number, late: number): number | null {
  const finished = onTime + late;
  return finished === 0 ? null : onTime / finished;
}

/** Part ÷ whole, or null when the whole is zero. */
export function share(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}
