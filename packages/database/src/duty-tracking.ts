import {
  consentIsCurrent,
  inLocationWindow,
  type TrackingState,
  trackingState,
  trackingSwitchedOn,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { personWorkSettings } from './schema/engagement.schema';
import { roles, userRoles } from './schema/identity.schema';
import { locationConsents } from './schema/workforce.schema';
import { currentWorkforcePolicy } from './travel-snapshot';

/** One person's tracking now, for the duty alerts. */
export interface PersonTracking {
  readonly state: TrackingState;
  readonly switchedOn: boolean;
  /** When consent to the current words was given; null when it is not given. */
  readonly consentedAt: Date | null;
}

/** "HH:MM" in the business time zone. */
const clockAt = (at: Date, timeZone: string): string =>
  new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(at);

/**
 * The tracking state of several people at `at` (PRD 4.3), read in three queries: the same
 * rule as the API's `trackingFor` (their own setting, else their roles, else the company
 * switch; then consent to the current words; then working hours).
 */
export async function trackingStates(
  db: DatabaseExecutor,
  userIds: readonly string[],
  at: Date,
  timeZone: string,
  known?: WorkforcePolicy,
): Promise<Map<string, PersonTracking>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const [policy, held, own, consents] = await Promise.all([
    known ?? currentWorkforcePolicy(db),
    db
      .select({ userId: userRoles.userId, key: roles.key })
      .from(userRoles)
      .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
      .where(inArray(userRoles.userId, ids)),
    db
      .select({ userId: personWorkSettings.userId, tracking: personWorkSettings.tracking })
      .from(personWorkSettings)
      .where(inArray(personWorkSettings.userId, ids)),
    db.select().from(locationConsents).where(inArray(locationConsents.userId, ids)),
  ]);
  const inHours = inLocationWindow(
    clockAt(at, timeZone),
    policy.attendance,
    policy.travel.hoursMarginMinutes,
  );
  const result = new Map<string, PersonTracking>();
  for (const id of ids) {
    const switchedOn = trackingSwitchedOn({
      company: policy.attendance.captureLocation,
      roleKeys: held.filter((row) => row.userId === id).map((row) => row.key),
      byRole: policy.attendance.trackingByRole,
      person: own.find((row) => row.userId === id)?.tracking ?? null,
    });
    const consent = consents.find((row) => row.userId === id) ?? null;
    const consentGiven = consentIsCurrent(consent);
    result.set(id, {
      state: trackingState({ switchedOn, consentGiven, inHours }),
      switchedOn,
      consentedAt: consentGiven ? (consent?.consentedAt ?? null) : null,
    });
  }
  return result;
}
