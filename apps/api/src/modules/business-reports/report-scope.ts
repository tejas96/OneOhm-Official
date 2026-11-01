import type { BusinessReportQuery, ReportMeta } from '@oneohm/api-contracts';
import { projects } from '@oneohm/database';
import { granularityFor, reportBuckets, reportRange } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, ne, type SQL } from 'drizzle-orm';

/** The moment a calendar date starts in India. */
export const indiaStart = (date: string) => new Date(`${date}T00:00:00+05:30`);
/** The calendar date (India) an instant falls on. */
export const indiaDate = (instant: Date) => todayIn('Asia/Kolkata', instant);

export interface ReportScope {
  readonly today: string;
  readonly meta: ReportMeta;
  /** First moment of the range and first moment after it, for instant columns. */
  readonly from: Date;
  readonly until: Date;
  /** Projects that are not cancelled, narrowed by manager and type when those are set. */
  readonly projects: SQL;
  readonly managerUserId: string | null;
  readonly projectType: BusinessReportQuery['projectType'] | null;
}

/** The days, buckets and project filter every report shares. */
export function reportScope(query: BusinessReportQuery, today = todayIn()): ReportScope {
  const range = reportRange(query.period ?? 'this_month', today);
  const granularity = granularityFor(range);
  const filters = [
    ne(projects.status, 'cancelled'),
    query.managerUserId ? eq(projects.managerUserId, query.managerUserId) : undefined,
    query.projectType ? eq(projects.type, query.projectType) : undefined,
  ].filter((filter): filter is SQL => filter !== undefined);
  return {
    today,
    meta: { range, granularity, buckets: reportBuckets(range, granularity) },
    from: indiaStart(range.start),
    until: indiaStart(addDays(range.end, 1)),
    projects: and(...filters) as SQL,
    managerUserId: query.managerUserId ?? null,
    projectType: query.projectType ?? null,
  };
}

/** Average of the values, rounded to one decimal; null when there are none. */
export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}
