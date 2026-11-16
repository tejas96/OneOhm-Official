import {
  attendanceDays,
  type DatabaseExecutor,
  dutyPoints,
  leaveRequests,
  siteVisits,
} from '@oneohm/database';
import { dutyWindowEnd, LIVE_TAIL_MINUTES, ROUTE_MAX_ACCURACY_M } from '@oneohm/domain';
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm';
import { readVisits, type VisitWithSite } from '../site-activity/site-visit-read';

export type DayRow = Pick<
  typeof attendanceDays.$inferSelect,
  'id' | 'userId' | 'workDate' | 'checkInAt' | 'checkOutAt'
>;
export type PointRow = typeof dutyPoints.$inferSelect;

const group = <T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
  const map = new Map<string, T[]>();
  for (const item of items) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
};

/** Today's site visits (an open visit from an earlier day is not today's work). */
export async function todaysVisits(
  db: DatabaseExecutor,
  ids: readonly string[],
  today: string,
): Promise<VisitWithSite[]> {
  if (ids.length === 0) return [];
  return readVisits(
    db,
    and(inArray(siteVisits.userId, [...ids]), eq(siteVisits.workDate, today)) as SQL,
  );
}

export interface DayFacts {
  /** Today's duty day by person (only today's: yesterday's open day is not live). */
  readonly days: Map<string, DayRow>;
  readonly onLeave: Set<string>;
}

export async function readDays(
  db: DatabaseExecutor,
  ids: readonly string[],
  today: string,
): Promise<DayFacts> {
  if (ids.length === 0) return { days: new Map(), onLeave: new Set() };
  const people = [...ids];
  const [dayRows, leave] = await Promise.all([
    db
      .select({
        id: attendanceDays.id,
        userId: attendanceDays.userId,
        workDate: attendanceDays.workDate,
        checkInAt: attendanceDays.checkInAt,
        checkOutAt: attendanceDays.checkOutAt,
      })
      .from(attendanceDays)
      .where(and(inArray(attendanceDays.userId, people), eq(attendanceDays.workDate, today))),
    db
      .select({ userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, people),
          eq(leaveRequests.status, 'approved'),
          lte(leaveRequests.fromDate, today),
          gte(leaveRequests.toDate, today),
        ),
      ),
  ]);
  return {
    days: new Map(dayRows.map((day) => [day.userId, day])),
    onLeave: new Set(leave.map((row) => row.userId)),
  };
}

/** Readings that can be measured with: not mocked, not too vague. */
const usable = () =>
  and(
    eq(dutyPoints.mocked, false),
    or(isNull(dutyPoints.accuracyM), lte(dutyPoints.accuracyM, ROUTE_MAX_ACCURACY_M)),
  );

/**
 * The route points the live map needs from today's open days, in two reads for everyone: the
 * last 30 minutes (state, tail, battery), and each day's newest usable point (where someone
 * who went quiet was last seen). Nothing after the day's duty cap.
 */
export async function recentPoints(
  db: DatabaseExecutor,
  openDays: readonly DayRow[],
  now: Date,
  timeZone: string,
): Promise<{ recent: Map<string, PointRow[]>; latest: Map<string, PointRow> }> {
  if (openDays.length === 0) return { recent: new Map(), latest: new Map() };
  const dayIds = openDays.map((day) => day.id);
  const cap = new Date(
    Math.min(...openDays.map((day) => dutyWindowEnd({ ...day, checkOutAt: null }, now, timeZone))),
  );
  const inDays = and(inArray(dutyPoints.attendanceDayId, dayIds), lte(dutyPoints.recordedAt, cap));
  const since = new Date(now.getTime() - LIVE_TAIL_MINUTES * 60_000);
  const [recent, latest] = await Promise.all([
    db
      .select()
      .from(dutyPoints)
      .where(and(inDays, gte(dutyPoints.recordedAt, since)))
      .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id)),
    db
      .selectDistinctOn([dutyPoints.attendanceDayId])
      .from(dutyPoints)
      .where(and(inDays, usable()))
      .orderBy(dutyPoints.attendanceDayId, desc(dutyPoints.recordedAt)),
  ]);
  return {
    recent: group(recent, (point) => point.attendanceDayId),
    latest: new Map(latest.map((point) => [point.attendanceDayId, point])),
  };
}
