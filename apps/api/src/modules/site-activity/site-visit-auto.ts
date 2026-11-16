import type { DatabaseExecutor } from '@oneohm/database';
import { raiseDutyAlert, siteVisits } from '@oneohm/database';
import type { CheckInSource } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, isNull, lte, or } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { currentCalendar } from '../../common/calendar';
import { conflict, unprocessable } from '../../common/http/errors';
import { acceptTap } from '../workforce/attendance-tap';
import { trackingFor } from '../workforce/tracking';
import { autoFloor } from './site-visit-floor';

/** What a phone's site fence adds to a check-in or check-out (Duty Day step 3). */
export interface AutoVisit {
  readonly source: 'manual' | 'auto_fence' | 'auto_route';
  /** When it happened, ISO; the phone's event time for a fence that waited for signal. */
  readonly tappedAt?: string | undefined;
  /** The reading the phone sent is a fake (mock) location. */
  readonly mocked?: boolean | undefined;
}

/** An automatic event older than this is not recorded: the person checks in by hand. */
export const AUTO_EVENT_MAX_MS = 2 * 3_600_000;

/** A fence event for the same job within this long of another visit's start is the same visit. */
const SAME_VISIT_MS = 15 * 60_000;

/**
 * The moment and source to record for a visit tap. A plain tap is now. An automatic one is
 * the event's own time, judged like an attendance tap (not in the future) and further:
 * - older than 2 hours is refused (`auto_event_too_old`, 422) and the phone drops it;
 * - never before the person's latest site check-out today or the day's check-in (the floor),
 *   when the server's time is used instead;
 * - `delayed` when it reached the server over 30 minutes after it happened.
 * An automatic check-in also needs the switch on in Settings and the person's consent, so a
 * fence event queued before they withdrew consent is turned away, and a fake location
 * (`mocked`) is refused (`mocked_location`, 422) and raises a `fake_gps` alert.
 */
export async function visitMoment(
  db: DatabaseExecutor,
  actor: Actor,
  auto: AutoVisit | undefined,
  now: Date,
  direction: 'in' | 'out',
): Promise<{ at: Date; source: CheckInSource; delayed: boolean }> {
  if (!auto || auto.source === 'manual') return { at: now, source: 'manual', delayed: false };
  if (direction === 'in') {
    const { policy, status } = await trackingFor(db, actor.userId, now);
    if (
      !policy.travel.autoSiteVisits ||
      status.state === 'no_consent' ||
      status.state === 'policy_off'
    )
      throw conflict('Automatic site visits are not on for you.', 'auto_off');
    if (auto.mocked) {
      // The refusal is kept as a red alert for the manager (Duty Day step 5), once a day.
      await raiseDutyAlert(db, {
        kind: 'fake_gps',
        personId: actor.userId,
        subjectType: 'person',
        subjectId: actor.userId,
        day: todayIn(currentCalendar().timeZone, now),
        title: `${actor.fullName}: fake GPS`,
        body: 'An automatic site check-in came from a fake (mock) location and was refused.',
        detail: { source: 'site_check_in' },
      });
      throw unprocessable('A fake location cannot check you in.', 'mocked_location');
    }
  }
  const happened = auto.tappedAt ? new Date(auto.tappedAt) : null;
  if (happened && now.getTime() - happened.getTime() > AUTO_EVENT_MAX_MS)
    throw unprocessable(
      'That arrival is too old to record. Check in by hand.',
      'auto_event_too_old',
    );
  const floor = await autoFloor(db, actor.userId, todayIn(currentCalendar().timeZone, now));
  const { at, delayed } = acceptTap(auto.tappedAt, now, floor);
  return { at, source: auto.source, delayed };
}

type Subject = { readonly taskId: string } | { readonly serviceRequestId: string };

/**
 * Whether the person already has this visit: one open on the same job, or one that began
 * within 15 minutes of `at` (the route and the phone both saw the same arrival). An
 * automatic event that finds it does nothing, so the two never make two visits.
 */
export async function alreadyVisiting(
  db: DatabaseExecutor,
  userId: string,
  subject: Subject,
  at: Date,
): Promise<boolean> {
  const [found] = await db
    .select({ id: siteVisits.id })
    .from(siteVisits)
    .where(
      and(
        eq(siteVisits.userId, userId),
        'taskId' in subject
          ? eq(siteVisits.taskId, subject.taskId)
          : eq(siteVisits.serviceRequestId, subject.serviceRequestId),
        or(
          isNull(siteVisits.checkOutAt),
          and(
            gte(siteVisits.checkInAt, new Date(at.getTime() - SAME_VISIT_MS)),
            lte(siteVisits.checkInAt, new Date(at.getTime() + SAME_VISIT_MS)),
          ),
        ),
      ),
    )
    .limit(1);
  return Boolean(found);
}

/** The phone's fence event on a check-in or check-out request, when it is one; a tap has none. */
export const phoneVisit = (body: {
  readonly source?: 'manual' | 'auto_fence' | undefined;
  readonly tappedAt?: string | undefined;
  readonly mocked?: boolean | undefined;
}): AutoVisit | undefined =>
  body.source
    ? { source: body.source, tappedAt: body.tappedAt, mocked: body.mocked === true }
    : undefined;

/** The reading to keep: none from a fake location, which is never kept as the person's place. */
export const phonePosition = <T>(body: {
  readonly position?: T | null | undefined;
  readonly source?: string | undefined;
  readonly mocked?: boolean | undefined;
}): T | null | undefined => (body.source && body.mocked ? null : body.position);
