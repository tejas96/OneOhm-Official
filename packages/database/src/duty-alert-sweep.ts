import {
  CLAIM_UNPAID_DAYS,
  CLAIM_WAITING_DAYS,
  clockString,
  isWorkingDay,
  locationCutoff,
  missedCheckIn,
  VISIT_OPEN_LONG_MINUTES,
} from '@oneohm/domain';
import { formatInr, todayIn } from '@oneohm/shared';
import { and, eq, gte, isNotNull, isNull, lt, ne, or } from 'drizzle-orm';
import { awayUserIds } from './away-today';
import { businessTimeZone, readBusinessCalendar } from './business-calendar';
import type { Database } from './client';
import { sweepRouteGaps } from './duty-alert-gap-sweep';
import { businessMinutes, missedVisits } from './duty-alert-missed';
import { reconcileDutyAlerts } from './duty-alert-reconcile';
import { raiseDutyAlert } from './duty-alert-store';
import { readableDay } from './readable-day';
import { payables } from './schema/finance.schema';
import { roleCapabilities, roles, userRoles, users } from './schema/identity.schema';
import { siteVisits, travelClaims } from './schema/site-activity.schema';
import { attendanceDays } from './schema/workforce.schema';
import { currentWorkforcePolicy } from './travel-snapshot';
import { settleVisitProof } from './visit-proof-store';

const DAY_MS = 86_400_000;
/**
 * The sweep tells about a doubtful visit only when it closed this recently. Every check-out
 * works the proof out (and tells) at once, so the sweep only meets a visit the close missed,
 * or, on its first run after the feature arrives, the day's earlier visits: those it works out
 * quietly instead of sending a burst of notices.
 */
export const PROOF_SWEEP_TELL_MINUTES = 15;

/** The sweep tells about a visit's proof only when the visit closed in the last 15 minutes. */
export const sweepTellsProof = (checkOutAt: Date | null, now: Date): boolean =>
  checkOutAt !== null && now.getTime() - checkOutAt.getTime() <= PROOF_SWEEP_TELL_MINUTES * 60_000;

/**
 * The oldest claim day an alert is raised for: the same cut-off the retention clean-up deletes
 * alerts before, so a cleared alert is never raised again.
 */
export const oldestClaimDay = (today: string, retentionDays: number): string =>
  locationCutoff(today, retentionDays);

/**
 * Active staff who mark attendance through a role that is not the all-powers one (the owner's
 * desk does not check in), not yet checked in today, on a working day, not away, 30 minutes
 * after the day start: `not_checked_in` for their manager.
 */
async function notCheckedIn(db: Database, now: Date, timeZone: string): Promise<number> {
  const today = todayIn(timeZone, now);
  const calendar = await readBusinessCalendar(db, timeZone);
  const due = missedCheckIn({
    workingDay: isWorkingDay(today, calendar),
    onLeave: false,
    checkedIn: false,
    dayStartMin: calendar.startMin,
    nowMin: businessMinutes(now, timeZone),
  });
  if (!due) return 0;
  const people = await db
    .selectDistinct({ id: users.id, name: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .innerJoin(roleCapabilities, eq(roleCapabilities.roleId, roles.id))
    .where(
      and(
        eq(users.status, 'active'),
        eq(roles.kind, 'staff'),
        eq(roles.system, false),
        eq(roleCapabilities.capability, 'attendance.mark'),
      ),
    );
  if (people.length === 0) return 0;
  const [away, days] = await Promise.all([
    awayUserIds(db, today),
    db
      .select({ userId: attendanceDays.userId })
      .from(attendanceDays)
      .where(eq(attendanceDays.workDate, today)),
  ]);
  const checkedIn = new Set(days.map((day) => day.userId));
  let raised = 0;
  for (const person of people) {
    if (away.has(person.id) || checkedIn.has(person.id)) continue;
    const alert = await raiseDutyAlert(db, {
      kind: 'not_checked_in',
      personId: person.id,
      subjectType: 'person',
      subjectId: person.id,
      day: today,
      title: `${person.name}: not checked in`,
      body: `No check-in by ${clockString(calendar.startMin + 30)}, and no leave.`,
    });
    if (alert.created) raised += 1;
  }
  return raised;
}

/** Site visits open over 4 hours. */
async function longVisits(db: Database, now: Date): Promise<number> {
  const rows = await db
    .select({ visit: siteVisits, name: users.fullName })
    .from(siteVisits)
    .innerJoin(users, eq(users.id, siteVisits.userId))
    .where(
      and(
        isNull(siteVisits.checkOutAt),
        lt(siteVisits.checkInAt, new Date(now.getTime() - VISIT_OPEN_LONG_MINUTES * 60_000)),
      ),
    );
  let raised = 0;
  for (const { visit, name } of rows) {
    const hours = Math.floor((now.getTime() - visit.checkInAt.getTime()) / 3_600_000);
    const alert = await raiseDutyAlert(db, {
      kind: 'visit_open_long',
      personId: visit.userId,
      subjectType: 'site_visit',
      subjectId: visit.id,
      day: visit.workDate,
      title: `${name}: site visit open over ${hours} h`,
      body: 'Still checked in at the site. Close the visit if they have left.',
      detail: { visitId: visit.id, hours },
    });
    if (alert.created) raised += 1;
  }
  return raised;
}

/**
 * Travel claims waiting over 2 days, and approved ones not paid after 7. A claim for a day
 * past the retention period raises nothing: its alert would be cleared with that day's route
 * and raised again every run.
 */
async function claims(db: Database, now: Date, timeZone: string): Promise<number> {
  const policy = await currentWorkforcePolicy(db);
  const oldest = oldestClaimDay(todayIn(timeZone, now), policy.attendance.retentionDays);
  const rows = await db
    .select({ claim: travelClaims, name: users.fullName, paid: payables.status })
    .from(travelClaims)
    .innerJoin(users, eq(users.id, travelClaims.userId))
    .leftJoin(payables, eq(payables.id, travelClaims.payableId))
    .where(
      and(
        gte(travelClaims.workDate, oldest),
        or(
          and(
            eq(travelClaims.status, 'pending'),
            lt(travelClaims.createdAt, new Date(now.getTime() - CLAIM_WAITING_DAYS * DAY_MS)),
          ),
          and(
            eq(travelClaims.status, 'approved'),
            isNotNull(travelClaims.decidedAt),
            lt(travelClaims.decidedAt, new Date(now.getTime() - CLAIM_UNPAID_DAYS * DAY_MS)),
            or(isNull(payables.status), ne(payables.status, 'paid')),
          ),
        ),
      ),
    );
  let raised = 0;
  for (const { claim, name } of rows) {
    const waiting = claim.status === 'pending';
    const money = formatInr(claim.amountPaise);
    const alert = await raiseDutyAlert(db, {
      kind: waiting ? 'claim_waiting' : 'claim_unpaid',
      personId: claim.userId,
      subjectType: 'travel_claim',
      subjectId: claim.id,
      day: claim.workDate,
      title: waiting ? `${name}: travel claim waiting` : `${name}: travel approved, not paid`,
      body: `${money} for ${readableDay(claim.workDate)}. ${waiting ? 'Approve or reject it.' : 'Pay it from Payables.'}`,
      detail: { claimId: claim.id, amountPaise: claim.amountPaise },
      opens: { type: 'travel_claim', id: claim.id },
    });
    if (alert.created) raised += 1;
  }
  return raised;
}

/**
 * A closed visit of today still without its proof (a safety net, and the first run's
 * catch-up): worked out, telling only about one closed in the last 15 minutes.
 */
async function unsettledProofs(db: Database, now: Date, timeZone: string): Promise<number> {
  const rows = await db
    .select({ id: siteVisits.id, out: siteVisits.checkOutAt })
    .from(siteVisits)
    .where(
      and(
        isNotNull(siteVisits.checkOutAt),
        isNull(siteVisits.proofAt),
        eq(siteVisits.workDate, todayIn(timeZone, now)),
      ),
    );
  for (const row of rows)
    await settleVisitProof(db, row.id, now, { notify: sweepTellsProof(row.out, now) });
  return 0;
}

/**
 * The time-based duty alerts, every five minutes (Duty Day step 5). First, open alerts whose
 * cause was fixed close themselves (`reconcileDutyAlerts`); then not checked in, route gaps,
 * visits open too long, planned visits nobody reached, claims waiting or unpaid, and any
 * closed visit of today still without its proof. Each alert fires once. Returns how many were
 * new.
 */
export async function sweepDutyAlerts(
  db: Database,
  now: Date = new Date(),
  timeZone: string = businessTimeZone(),
): Promise<number> {
  const steps = [
    () => reconcileDutyAlerts(db, now, timeZone).then(() => 0),
    () => notCheckedIn(db, now, timeZone),
    () => sweepRouteGaps(db, now, timeZone),
    () => longVisits(db, now),
    () => missedVisits(db, now, timeZone),
    () => claims(db, now, timeZone),
    () => unsettledProofs(db, now, timeZone),
  ];
  let raised = 0;
  let failure: unknown = null;
  for (const step of steps) {
    try {
      raised += await step();
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return raised;
}
