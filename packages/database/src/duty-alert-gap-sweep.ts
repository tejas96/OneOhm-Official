import { gapReason, locationOnAt, ROUTE_MAX_ACCURACY_M, silentMinutes } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, desc, eq, inArray, isNull, lte, or } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { applyRouteGap, closeGapLocationOff, type GapDay, type GapPoint } from './duty-alert-gap';
import { trackingStates } from './duty-tracking';
import { dutyPoints } from './schema/duty-points.schema';
import { attendanceDays } from './schema/workforce.schema';

/**
 * Each open day's newest usable point, in one query (`DISTINCT ON`, on the day and time
 * index): all the five-minute gap check needs, never a whole day of points.
 */
export async function latestPoints(
  db: DatabaseExecutor,
  dayIds: readonly string[],
  now: Date,
): Promise<Map<string, GapPoint>> {
  if (dayIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([dutyPoints.attendanceDayId], {
      dayId: dutyPoints.attendanceDayId,
      recordedAt: dutyPoints.recordedAt,
      batteryPercent: dutyPoints.batteryPercent,
      charging: dutyPoints.charging,
      network: dutyPoints.network,
    })
    .from(dutyPoints)
    .where(
      and(
        inArray(dutyPoints.attendanceDayId, [...dayIds]),
        eq(dutyPoints.mocked, false),
        or(isNull(dutyPoints.accuracyM), lte(dutyPoints.accuracyM, ROUTE_MAX_ACCURACY_M)),
        lte(dutyPoints.recordedAt, now),
      ),
    )
    .orderBy(dutyPoints.attendanceDayId, desc(dutyPoints.recordedAt));
  return new Map(rows.map(({ dayId, ...point }) => [dayId, point]));
}

/**
 * The five-minute route gap check of today's open days (Duty Day step 5). Only people whose
 * location is being read now are looked at (consent to the current words, switched on, within
 * hours); for someone whose consent was withdrawn or whose location was switched off, an open
 * gap is closed as `location_off`. The silence now runs from the day's newest usable point;
 * a day with no point yet is left alone. Earlier gaps are found on upload, from the full day.
 */
export async function sweepRouteGaps(
  db: DatabaseExecutor,
  now: Date,
  timeZone: string,
): Promise<number> {
  const open: GapDay[] = await db
    .select({
      id: attendanceDays.id,
      userId: attendanceDays.userId,
      workDate: attendanceDays.workDate,
      checkInAt: attendanceDays.checkInAt,
      checkOutAt: attendanceDays.checkOutAt,
    })
    .from(attendanceDays)
    .where(
      and(eq(attendanceDays.workDate, todayIn(timeZone, now)), isNull(attendanceDays.checkOutAt)),
    );
  if (open.length === 0) return 0;
  const tracking = await trackingStates(
    db,
    open.map((day) => day.userId),
    now,
    timeZone,
  );
  const reading: GapDay[] = [];
  for (const day of open) {
    const state = tracking.get(day.userId)?.state;
    if (state === 'on') reading.push(day);
    else if (state === 'no_consent' || state === 'policy_off')
      await closeGapLocationOff(db, day, now);
  }
  const latest = await latestPoints(
    db,
    reading.map((day) => day.id),
    now,
  );
  let raised = 0;
  for (const day of reading) {
    const last = latest.get(day.id);
    if (!last) continue;
    const since = last.recordedAt > day.checkInAt ? last.recordedAt : day.checkInAt;
    const quietNow = silentMinutes({ dutyStartedAt: day.checkInAt, lastPointAt: since, now });
    const person = tracking.get(day.userId);
    const on = { on: true, consentedAt: person?.consentedAt ?? null };
    const silence = {
      longest: { minutes: quietNow, reason: gapReason(last, locationOnAt(since, on)) },
      quietNow,
      quietSince: since,
    };
    if (await applyRouteGap(db, day, silence, now)) raised += 1;
  }
  return raised;
}
