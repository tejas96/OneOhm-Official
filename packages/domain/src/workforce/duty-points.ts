import { addDays } from '@oneohm/shared';
import { zonedInstant } from '../calendar/business-calendar';

/**
 * Route points a phone records while its person is on duty (Duty Day step 1). The phone
 * uploads them in batches, often late, so each one is judged on its own time against the
 * person's attendance days. The step-2 km reads the accepted points of a day.
 */

/** Most points one upload may carry. */
export const DUTY_BATCH_MAX = 200;

/** A flush that was waiting for signal may arrive this long after the check-out. */
export const DUTY_LATE_FLUSH_MS = 5 * 60_000;

/** An open day that was never closed stops taking points this long after its work date ends. */
export const DUTY_OPEN_DAY_CAP_MS = 6 * 3_600_000;

/** A phone clock a little ahead of the server is not a lie. */
export const DUTY_SKEW_MS = 2 * 60_000;

export type DutyPointRejection =
  | 'no_consent'
  | 'policy_off'
  | 'no_open_day'
  | 'outside_duty'
  | 'in_future'
  | 'bad_coordinates';

/** The part of an attendance day that says when the person was on duty. */
export interface DutyWindowDay {
  readonly id: string;
  /** The day's work date (`YYYY-MM-DD`, business time zone): it sets the cap of an open day. */
  readonly workDate: string;
  readonly checkInAt: Date;
  readonly checkOutAt: Date | null;
}

export type DutyPointVerdict =
  | { readonly accepted: true; readonly dayId: string | null }
  | { readonly accepted: false; readonly reason: DutyPointRejection };

/** A real fix: finite, on the globe and not the (0, 0) a failed read often returns. */
export function validCoordinates(latitude: number, longitude: number): boolean {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return false;
  return !(latitude === 0 && longitude === 0);
}

/**
 * When the day stops taking points. A closed day: 5 minutes after its check-out (a flush
 * that waited for signal). An open day: now (give or take the clock skew), but never later
 * than 6 hours after its work date ends in the business time zone, so a day the person forgot
 * to close cannot swallow the next night's points. The next day's check-in also ends it, but
 * `judgeDutyPoint` already hands a point to the day with the latest check-in before it.
 */
export function dutyWindowEnd(day: DutyWindowDay, now: Date, timeZone: string): number {
  if (day.checkOutAt) return day.checkOutAt.getTime() + DUTY_LATE_FLUSH_MS;
  const cap = zonedInstant(addDays(day.workDate, 1), 0, timeZone).getTime() + DUTY_OPEN_DAY_CAP_MS;
  return Math.min(now.getTime() + DUTY_SKEW_MS, cap);
}

/**
 * Whether one point is kept, and for which day. A duplicate (the phone retrying a batch
 * that got through) counts as accepted before any other rule, so it is never sent again.
 * Otherwise: the policy switch, consent to the current words given before the point was
 * recorded, real coordinates, not in the future, then inside the day the point belongs to:
 * the day with the latest check-in at or before the point, up to `dutyWindowEnd`. The fixed
 * working hours do not limit a route point: duty does.
 *
 * Consent is judged at the person's current `consentedAt`. The policy switch has no history,
 * so a gap while it was off cannot be judged per point; only the current state is known.
 */
export function judgeDutyPoint(input: {
  readonly recordedAt: Date;
  readonly latitude: number;
  readonly longitude: number;
  readonly now: Date;
  readonly switchedOn: boolean;
  readonly consentGiven: boolean;
  /** When the current consent was given; a point recorded before it is turned away. */
  readonly consentedAt?: Date | null;
  /** The person's days around the point, open or closed. */
  readonly days: readonly DutyWindowDay[];
  readonly duplicate: boolean;
  readonly timeZone?: string;
}): DutyPointVerdict {
  if (input.duplicate) return { accepted: true, dayId: null };
  if (!input.switchedOn) return { accepted: false, reason: 'policy_off' };
  if (!input.consentGiven) return { accepted: false, reason: 'no_consent' };
  const at = input.recordedAt.getTime();
  if (input.consentedAt && at < input.consentedAt.getTime())
    return { accepted: false, reason: 'no_consent' };
  if (!validCoordinates(input.latitude, input.longitude))
    return { accepted: false, reason: 'bad_coordinates' };
  if (Number.isNaN(at)) return { accepted: false, reason: 'outside_duty' };
  const now = input.now.getTime();
  if (at - now > DUTY_SKEW_MS) return { accepted: false, reason: 'in_future' };
  if (input.days.length === 0) return { accepted: false, reason: 'no_open_day' };
  let day: DutyWindowDay | undefined;
  for (const candidate of input.days)
    if (
      candidate.checkInAt.getTime() <= at &&
      (!day || candidate.checkInAt.getTime() > day.checkInAt.getTime())
    )
      day = candidate;
  if (!day || at > dutyWindowEnd(day, input.now, input.timeZone ?? 'Asia/Kolkata'))
    return { accepted: false, reason: 'outside_duty' };
  return { accepted: true, dayId: day.id };
}

export interface RoutePointTime {
  readonly recordedAt: Date;
  readonly mocked: boolean;
}

export interface DutyRouteSummary {
  readonly count: number;
  readonly firstAt: Date | null;
  readonly lastAt: Date | null;
  readonly mockedCount: number;
  /** The longest silence between two points, in whole minutes; 0 with fewer than two points. */
  readonly maxGapMinutes: number;
}

/** The numbers a manager reads first on a day's route; `points` must be in time order. */
export function summariseDutyRoute(points: readonly RoutePointTime[]): DutyRouteSummary {
  let longest = 0;
  for (let index = 1; index < points.length; index += 1) {
    const before = points[index - 1]?.recordedAt.getTime() ?? 0;
    longest = Math.max(longest, (points[index]?.recordedAt.getTime() ?? 0) - before);
  }
  return {
    count: points.length,
    firstAt: points[0]?.recordedAt ?? null,
    lastAt: points.at(-1)?.recordedAt ?? null,
    mockedCount: points.filter((point) => point.mocked).length,
    maxGapMinutes: Math.floor(longest / 60_000),
  };
}
