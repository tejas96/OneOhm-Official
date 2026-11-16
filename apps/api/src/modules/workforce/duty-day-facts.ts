import {
  attendanceDays,
  type DatabaseExecutor,
  dutyPoints,
  readBase,
  siteVisits,
} from '@oneohm/database';
import {
  dayStops,
  dutyWindowEnd,
  keptPoints,
  type Stop,
  type StopSite,
  selectDutySites,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { and, asc, eq, lte, type SQL } from 'drizzle-orm';
import { siteCandidates } from '../site-activity/site-candidates';
import { readVisits, type VisitWithSite } from '../site-activity/site-visit-read';
import { activeLocations, loadPolicy } from './policy';

export type DayRow = typeof attendanceDays.$inferSelect;
export type PointRow = typeof dutyPoints.$inferSelect;

/** No cap: the phone's 18-fence limit is for fencing, not for naming the day's stops. */
const NO_CAP = Number.MAX_SAFE_INTEGER;

/** What is known about one person's duty day, for the timeline and the point-upload alerts. */
export interface DayFacts {
  readonly policy: WorkforcePolicy;
  /** The day's attendance row; null when the person did not start duty. */
  readonly day: DayRow | null;
  /** Every accepted point of the day up to its duty cap, oldest first. */
  readonly points: readonly PointRow[];
  /** The points the route measures with (`keptPoints`). */
  readonly kept: readonly PointRow[];
  readonly visits: readonly VisitWithSite[];
  readonly stops: readonly Stop[];
}

/**
 * The customer sites of the day a stop may be at: every site the person visited that day,
 * and the sites they had work at (the same choice their phone fences by).
 */
async function sitesOfDay(
  db: DatabaseExecutor,
  userId: string,
  date: string,
  visits: readonly VisitWithSite[],
  radiusM: number,
): Promise<StopSite[]> {
  const sites = new Map<string, StopSite>();
  for (const visit of visits) {
    if (!visit.site) continue;
    const id = visit.row.taskId ?? visit.row.serviceRequestId ?? visit.row.id;
    sites.set(id, { id, label: visit.record.siteLabel ?? 'Customer site', ...visit.site, radiusM });
  }
  const own = await siteCandidates(db, [userId]);
  for (const site of selectDutySites(own, date, radiusM, NO_CAP))
    if (!sites.has(site.id)) sites.set(site.id, { ...site });
  return [...sites.values()];
}

/**
 * The person's day on `date`: its row, points, visits and named stops. Read once per upload
 * and shared by the alerts (gap, unknown stop, proof). Stops count only inside the duty
 * window, and the person's saved base place is a known place ("Home base").
 */
export async function readDayFacts(
  db: DatabaseExecutor,
  userId: string,
  date: string,
  now: Date,
  timeZone: string,
): Promise<DayFacts> {
  const [policy, [day], visits] = await Promise.all([
    loadPolicy(db),
    db
      .select()
      .from(attendanceDays)
      .where(and(eq(attendanceDays.userId, userId), eq(attendanceDays.workDate, date)))
      .limit(1),
    readVisits(db, and(eq(siteVisits.userId, userId), eq(siteVisits.workDate, date)) as SQL),
  ]);
  const ordered = [...visits].reverse();
  if (!day) return { policy, day: null, points: [], kept: [], visits: ordered, stops: [] };
  const points = await db
    .select()
    .from(dutyPoints)
    .where(
      and(
        eq(dutyPoints.attendanceDayId, day.id),
        lte(dutyPoints.recordedAt, new Date(dutyWindowEnd(day, now, timeZone))),
      ),
    )
    .orderBy(asc(dutyPoints.recordedAt), asc(dutyPoints.id));
  const kept = keptPoints(points);
  const [offices, sites, base] = await Promise.all([
    activeLocations(db),
    sitesOfDay(db, userId, date, visits, policy.travel.siteFenceM),
    readBase(db, userId),
  ]);
  const stops = dayStops(kept, {
    offices,
    sites,
    unknownStopMinutes: policy.travel.unknownStopMinutes,
    base,
    window: { start: day.checkInAt, end: day.checkOutAt },
  });
  return { policy, day, points, kept, visits: ordered, stops };
}
