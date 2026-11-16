import {
  type GapReason,
  gapReason,
  locationOnAt,
  ROUTE_GAP_MINUTES,
  ROUTE_MAX_ACCURACY_M,
  routeGapSeverity,
  silentMinutes,
} from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { personName, raiseDutyAlert, resolveDutyAlert } from './duty-alert-store';
import { dutyAlerts } from './schema/duty-alerts.schema';

/** The part of an attendance day the gap check needs. */
export interface GapDay {
  readonly id: string;
  readonly userId: string;
  readonly workDate: string;
  readonly checkInAt: Date;
  readonly checkOutAt: Date | null;
}

/** The phone's readings the gap check looks at. */
export interface GapPoint {
  readonly recordedAt: Date;
  readonly batteryPercent: number | null;
  readonly charging: boolean | null;
  readonly network: string | null;
  readonly mocked?: boolean | null;
  readonly accuracyM?: number | null;
}

/** Location being read for the person (`on`), and since when consent to it holds. */
export interface GapTracking {
  readonly on: boolean;
  readonly consentedAt: Date | null;
}

interface Silence {
  readonly minutes: number;
  readonly reason: GapReason;
}

/** What the day's points say: its longest silence, and the silence going on now. */
export interface DaySilence {
  readonly longest: Silence;
  readonly quietNow: number;
  /** When the silence going on now began: the last usable point, else the check-in. */
  readonly quietSince: Date;
}

/** A point the route can use: not mocked, accurate enough, not from the future. */
export const usableGapPoint = (point: GapPoint, now: Date): boolean =>
  !point.mocked &&
  (point.accuracyM == null || point.accuracyM <= ROUTE_MAX_ACCURACY_M) &&
  point.recordedAt.getTime() <= now.getTime();

/**
 * The longest silence of the day so far, and how long the phone has been quiet now, from the
 * day's points (any order; unusable ones are left out). The reason comes from the reading
 * before the silence, and is `location_off` when location was not being read when it began.
 */
export function daySilence(
  day: GapDay,
  points: readonly GapPoint[],
  now: Date,
  tracking: GapTracking,
): DaySilence {
  const usable = points
    .filter((point) => usableGapPoint(point, now))
    .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  let longest: Silence = { minutes: 0, reason: 'unknown' };
  let heard = day.checkInAt;
  let last: GapPoint | null = null;
  const measure = (to: Date) => {
    const minutes = Math.floor((to.getTime() - heard.getTime()) / 60_000);
    if (minutes > longest.minutes)
      longest = { minutes, reason: gapReason(last, locationOnAt(heard, tracking)) };
  };
  for (const point of usable) {
    if (point.recordedAt < heard) continue;
    measure(point.recordedAt);
    heard = point.recordedAt;
    last = point;
  }
  measure(day.checkOutAt ?? now);
  const quietNow = day.checkOutAt
    ? 0
    : silentMinutes({ dutyStartedAt: day.checkInAt, lastPointAt: last?.recordedAt ?? null, now });
  return { longest, quietNow, quietSince: heard };
}

const WORDS: Readonly<Record<GapReason, string>> = {
  low_battery: 'battery was low',
  no_network: 'no network',
  location_off: 'location was off',
  unknown: 'the app may have been closed',
};

const findGap = (db: DatabaseExecutor, day: GapDay) =>
  db
    .select()
    .from(dutyAlerts)
    .where(
      and(
        eq(dutyAlerts.kind, 'route_gap'),
        eq(dutyAlerts.subjectId, day.userId),
        eq(dutyAlerts.day, day.workDate),
      ),
    )
    .limit(1)
    .then((rows) => rows[0]);

/** The route gap alert as stored, as far as the next step needs it. */
export interface StoredGap {
  readonly severity: 'amber' | 'red';
  readonly resolvedAt: Date | null;
  readonly resolvedBy: string | null;
}

/** What to do with the day's route gap alert. */
export type GapStep =
  | { readonly do: 'none' }
  | { readonly do: 'raise'; readonly severity: 'amber' | 'red'; readonly ended: boolean }
  | { readonly do: 'resolve'; readonly red: boolean }
  | { readonly do: 'open'; readonly red: boolean };

/**
 * The route gap rule of one duty day (Duty Day step 5): on duty with no usable point for over
 * 20 minutes raises it (amber; red over an hour). When points come again (or the day ended)
 * it is resolved; a new silence the same day opens it again, red once any silence passed an
 * hour. A person who closed it is not overruled: it opens again only for a silence that began
 * after they closed it. A gap late points show had already ended is raised already resolved.
 */
export function gapStep(existing: StoredGap | null, silence: DaySilence): GapStep {
  const severity = routeGapSeverity(silence.longest.minutes);
  const over = silence.quietNow <= ROUTE_GAP_MINUTES;
  if (!existing) return severity ? { do: 'raise', severity, ended: over } : { do: 'none' };
  const red = existing.severity === 'red' || severity === 'red';
  if (over) return { do: 'resolve', red };
  const { resolvedAt } = existing;
  if (resolvedAt && existing.resolvedBy && silence.quietSince.getTime() <= resolvedAt.getTime())
    return { do: 'none' };
  return { do: 'open', red };
}

/**
 * Applies `gapStep` to the stored alert: a new one tells the manager once; opening it again
 * tells nobody. Returns true when a new alert was raised.
 */
export async function applyRouteGap(
  db: DatabaseExecutor,
  day: GapDay,
  silence: DaySilence,
  now: Date,
): Promise<boolean> {
  const { longest, quietNow } = silence;
  const existing = await findGap(db, day);
  const step = gapStep(existing ?? null, silence);
  if (step.do === 'none') return false;
  if (step.do === 'resolve' && existing) {
    if (!existing.resolvedAt) await resolveDutyAlert(db, existing.id, 'points_resumed', null, now);
    if (step.red && existing.severity !== 'red')
      await db.update(dutyAlerts).set({ severity: 'red' }).where(eq(dutyAlerts.id, existing.id));
    return false;
  }
  if (step.do === 'open' && existing) {
    await db
      .update(dutyAlerts)
      .set({
        severity: step.red ? 'red' : 'amber',
        detail: { minutes: Math.max(longest.minutes, quietNow), reason: longest.reason },
        resolvedAt: null,
        resolvedBy: null,
        resolvedReason: null,
      })
      .where(eq(dutyAlerts.id, existing.id));
    return false;
  }
  if (step.do !== 'raise') return false;
  const name = await personName(db, day.userId);
  const raised = await raiseDutyAlert(
    db,
    {
      kind: 'route_gap',
      personId: day.userId,
      subjectType: 'person',
      subjectId: day.userId,
      day: day.workDate,
      title: `${name}: no location for ${longest.minutes} min`,
      body: `On duty with no location; ${WORDS[longest.reason]}.`,
      detail: { minutes: longest.minutes, reason: longest.reason },
      severity: step.severity,
    },
    step.ended ? { resolvedReason: 'points_resumed' } : {},
  );
  return raised.created;
}

/**
 * The gap check after an upload, from the day's points already read: only while location is
 * being read for the person, and only for a day whose phone sent points (with location off
 * from the start there is nothing to miss).
 */
export async function checkRouteGap(
  db: DatabaseExecutor,
  day: GapDay,
  points: readonly GapPoint[],
  tracking: GapTracking,
  now: Date = new Date(),
): Promise<boolean> {
  if (!tracking.on || !points.some((point) => usableGapPoint(point, now))) return false;
  return applyRouteGap(db, day, daySilence(day, points, now, tracking), now);
}

/** Location stopped being read (consent withdrawn, or switched off): an open gap is closed. */
export async function closeGapLocationOff(
  db: DatabaseExecutor,
  day: GapDay,
  now: Date,
): Promise<boolean> {
  const existing = await findGap(db, day);
  if (!existing || existing.resolvedAt) return false;
  return resolveDutyAlert(db, existing.id, 'location_off', null, now);
}
