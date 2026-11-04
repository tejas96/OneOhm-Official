import type { BusinessReportQuery, ReportMeta } from '@oneohm/api-contracts';
import { projectManagerTerms, projects } from '@oneohm/database';
import { granularityFor, reportBuckets, reportRange } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, eq, exists, ne, type SQL, sql } from 'drizzle-orm';

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

/**
 * Projects the manager ran at some point in the range: a manager term of theirs that
 * started before the range ended and had not ended before it began. Reports follow the
 * manager of the time; only "who runs it now" screens use `projects.managerUserId`.
 */
export function managedInRange(managerUserId: string, from: Date, until: Date): SQL {
  return exists(
    sql`(select 1 from ${projectManagerTerms}
      where ${projectManagerTerms.projectId} = ${projects.id}
        and ${projectManagerTerms.userId} = ${managerUserId}
        and ${projectManagerTerms.startedAt} < ${until}
        and (${projectManagerTerms.endedAt} is null or ${projectManagerTerms.endedAt} >= ${from}))`,
  );
}

/** The days, buckets and project filter every report shares. */
export function reportScope(query: BusinessReportQuery, today = todayIn()): ReportScope {
  const range = reportRange(query.period ?? 'this_month', today);
  const granularity = granularityFor(range);
  const from = indiaStart(range.start);
  const until = indiaStart(addDays(range.end, 1));
  const filters = [
    ne(projects.status, 'cancelled'),
    query.managerUserId ? managedInRange(query.managerUserId, from, until) : undefined,
    query.projectType ? eq(projects.type, query.projectType) : undefined,
  ].filter((filter): filter is SQL => filter !== undefined);
  return {
    today,
    meta: { range, granularity, buckets: reportBuckets(range, granularity) },
    from,
    until,
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
