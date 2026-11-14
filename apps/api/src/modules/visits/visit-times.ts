import {
  type DatabaseExecutor,
  leaveRequests,
  readBusinessSetting,
  visits,
} from '@oneohm/database';
import {
  type Booker,
  bookableDays,
  type DaySlot,
  freeTimes,
  OPEN_VISIT_STATUSES,
  type Span,
  type WordsLang,
} from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { loadCalendar } from '../../common/calendar';

/** Days of visits and leave read: wide enough for any "days ahead" setting (max 45). */
const DATA_WINDOW = 46;

/** Older rows without a time keep the time their half of the day maps to. */
const HALF_START = { morning: 600, afternoon: 840 } as const;

/** The business calendar and Settings → Visits & bookings, read together. */
export async function visitRules(db: DatabaseExecutor, timeZone?: string) {
  const [cal, settings] = await Promise.all([
    loadCalendar(db, timeZone),
    readBusinessSetting(db, 'visits'),
  ]);
  return { cal, settings };
}

/**
 * Per day, the times the crew is not free: each open visit (by its exact time) and each day of
 * leave asked or approved (the whole day). One engine for every picker and check, so the
 * customer's list, the staff box and the save never disagree.
 */
export async function busySpans(
  db: DatabaseExecutor,
  crew: readonly string[],
  today: string,
  exceptVisitId?: string,
): Promise<Record<string, Span[]>> {
  const busy: Record<string, Span[]> = {};
  if (crew.length === 0) return busy;
  const end = addDays(today, DATA_WINDOW);
  const add = (day: string, span: Span) => {
    busy[day] = [...(busy[day] ?? []), span];
  };
  const people = sql`ARRAY[${sql.join(
    crew.map((id) => sql`${id}::uuid`),
    sql`, `,
  )}]`;
  const rows = await db
    .select({
      day: visits.day,
      slot: visits.slot,
      startMin: visits.startMin,
      endMin: visits.endMin,
    })
    .from(visits)
    .where(
      and(
        inArray(visits.status, [...OPEN_VISIT_STATUSES]),
        gte(visits.day, today),
        lte(visits.day, end),
        sql`${visits.crewUserIds} && ${people}`,
        exceptVisitId ? ne(visits.id, exceptVisitId) : undefined,
      ),
    );
  for (const row of rows) {
    const startMin = row.startMin ?? HALF_START[row.slot];
    add(row.day, { startMin, endMin: row.endMin ?? startMin + 90 });
  }
  const leave = await db
    .select({ from: leaveRequests.fromDate, to: leaveRequests.toDate })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.userId, [...crew]),
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.fromDate, end),
        gte(leaveRequests.toDate, today),
      ),
    );
  // Leave blocks the whole day, as many times as a slot can hold, so no visit fits.
  for (const row of leave)
    for (let day = row.from; day <= row.to && day <= end; day = addDays(day, 1))
      for (let n = 0; n < 3; n += 1) add(day, { startMin: 0, endMin: 1440 });
  return busy;
}

export interface TimesQuery {
  readonly crew: readonly string[];
  readonly who: Booker;
  readonly now?: Date;
  readonly exceptVisitId?: string;
  readonly timeZone?: string;
  readonly lang?: WordsLang;
}

/** The free times of one day for the crew (empty for a day that cannot be booked). */
export async function timesFor(
  db: DatabaseExecutor,
  day: string,
  query: TimesQuery,
): Promise<DaySlot[]> {
  const { cal, settings } = await visitRules(db, query.timeZone);
  const now = query.now ?? new Date();
  const busy = await busySpans(db, query.crew, todayIn(cal.timeZone, now), query.exceptVisitId);
  return freeTimes(cal, settings, day, busy[day] ?? [], now, query.who, query.lang ?? 'en');
}

/** The first "days shown" days with at least one free time for the crew, soonest first. */
export async function daysFor(db: DatabaseExecutor, query: TimesQuery): Promise<string[]> {
  const { cal, settings } = await visitRules(db, query.timeZone);
  const now = query.now ?? new Date();
  const busy = await busySpans(db, query.crew, todayIn(cal.timeZone, now), query.exceptVisitId);
  return bookableDays(cal, settings, now, query.who)
    .filter((day) => freeTimes(cal, settings, day, busy[day] ?? [], now, query.who).length > 0)
    .slice(0, settings.daysShown);
}
