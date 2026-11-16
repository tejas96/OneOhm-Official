import {
  checkRouteGap,
  type DatabaseExecutor,
  type GapTracking,
  raiseDutyAlert,
  settleVisitProof,
} from '@oneohm/database';
import type { Stop } from '@oneohm/domain';
import { type DayFacts, readDayFacts } from './duty-day-facts';

interface DayRef {
  readonly id: string;
  readonly workDate: string;
  readonly checkInAt: Date;
  readonly checkOutAt: Date | null;
}

interface SavedPoint {
  readonly attendanceDayId: string;
  readonly recordedAt: Date;
  readonly mocked?: boolean | null | undefined;
}

/** "10:42" in the business time zone. */
const clock = (at: Date, timeZone: string) =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at);

/** The first flagged unknown stop of the day, as `unknown_stop` (once a day). */
async function unknownStop(
  db: DatabaseExecutor,
  person: { readonly userId: string; readonly fullName: string },
  day: DayRef,
  stop: Stop,
  timeZone: string,
): Promise<void> {
  await raiseDutyAlert(db, {
    kind: 'unknown_stop',
    personId: person.userId,
    subjectType: 'person',
    subjectId: person.userId,
    day: day.workDate,
    title: `${person.fullName}: unknown stop ${stop.minutes} min`,
    body: `Stopped away from every office and site from ${clock(stop.startAt, timeZone)}.`,
    detail: {
      minutes: stop.minutes,
      from: clock(stop.startAt, timeZone),
      to: clock(stop.endAt, timeZone),
    },
  });
}

/**
 * The closed visits of the day the new points reach: only those overlapping the points' own
 * time range have their proof worked out again.
 */
export function visitsToRefresh(
  facts: Pick<DayFacts, 'visits'>,
  points: readonly SavedPoint[],
): string[] {
  if (points.length === 0) return [];
  const times = points.map((point) => point.recordedAt.getTime());
  const from = Math.min(...times);
  const to = Math.max(...times);
  return facts.visits
    .filter(({ row }) => row.checkOutAt !== null)
    .filter(({ row }) => row.checkInAt.getTime() <= to && (row.checkOutAt?.getTime() ?? 0) >= from)
    .map(({ row }) => row.id);
}

/**
 * The cheap alert checks after a person's points are saved (Duty Day step 5), for each day the
 * points went to, from one read of that day (`readDayFacts`): a mocked point raises
 * `fake_gps`; the route gap is raised or resolved (`checkRouteGap`, only while location is
 * read for them); a flagged unknown stop raises `unknown_stop`; closed visits overlapping the
 * new points have their proof worked out again from the same points. Each alert fires once a
 * day.
 */
export async function alertsAfterPoints(
  db: DatabaseExecutor,
  person: { readonly userId: string; readonly fullName: string },
  saved: readonly SavedPoint[],
  days: readonly DayRef[],
  tracking: GapTracking,
  now: Date,
  timeZone: string,
): Promise<void> {
  for (const day of days) {
    const mine = saved.filter((point) => point.attendanceDayId === day.id);
    if (mine.length === 0) continue;
    if (mine.some((point) => point.mocked))
      await raiseDutyAlert(db, {
        kind: 'fake_gps',
        personId: person.userId,
        subjectType: 'person',
        subjectId: person.userId,
        day: day.workDate,
        title: `${person.fullName}: fake GPS`,
        body: 'The phone reported a fake (mock) location on duty.',
        detail: { source: 'route' },
      });
    const facts = await readDayFacts(db, person.userId, day.workDate, now, timeZone);
    if (!facts.day) continue;
    await checkRouteGap(db, { ...facts.day, userId: person.userId }, facts.points, tracking, now);
    const flagged = facts.stops.find((stop) => stop.flagged);
    if (flagged) await unknownStop(db, person, day, flagged, timeZone);
    for (const visitId of visitsToRefresh(facts, mine))
      await settleVisitProof(db, visitId, now, { points: facts.points });
  }
}
