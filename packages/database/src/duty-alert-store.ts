import {
  DUTY_ALERT_SEVERITY,
  type DutyAlertKind,
  type DutyAlertSeverity,
  type DutyAlertSubject,
  mayReopen,
  TRAVEL_FINANCE_RIGHTS,
  TRAVEL_HR_RIGHT,
} from '@oneohm/domain';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { type Notice, notifyCover, notifyHolders } from './notify';
import { type DutyAlertDetail, dutyAlerts } from './schema/duty-alerts.schema';
import { users } from './schema/identity.schema';
import { reportingLines } from './schema/reporting.schema';

/**
 * One alert to raise (Duty Day step 5). Each kind fires once per subject and day; a travel
 * claim's day is the claim's own work date, so a claim alert is in effect one per claim.
 */
export interface DutyAlertInput {
  readonly kind: DutyAlertKind;
  readonly personId: string;
  readonly subjectType: DutyAlertSubject;
  readonly subjectId: string;
  readonly day: string;
  /** What the feed and the push notice say first: "Ravi Patil: fake GPS". */
  readonly title: string;
  /** One line under the title in the notice. */
  readonly body: string;
  /** Labels and numbers for the feed; never coordinates. */
  readonly detail?: DutyAlertDetail;
  /** The kind's own colour unless given (`DUTY_ALERT_SEVERITY`). */
  readonly severity?: DutyAlertSeverity;
  /** The record the push notice opens: the task, request or claim, when there is one. */
  readonly opens?: Notice['subject'];
  /**
   * When the cause began. A closed alert of the same kind, subject and day opens again (with
   * no second notice) only for a cause that began after it was closed (`mayReopen`).
   */
  readonly since?: Date;
}

export interface RaiseOptions {
  /**
   * False when the event already told the same people its own way (a job left unfinished
   * tells the manager from the leave-reason flow), so nobody hears twice.
   */
  readonly notify?: boolean;
  /** Raised already over (a gap the late points show had ended): kept, nobody told. */
  readonly resolvedReason?: string;
}

interface AlertRef {
  readonly id: string;
  readonly kind: DutyAlertKind;
  readonly personId: string;
  readonly subjectType: DutyAlertSubject;
  readonly subjectId: string;
}

/**
 * The notice's key: one per alert, and for a travel claim one per claim and kind, so an alert
 * made again after the retention clean-up never tells anyone a second time.
 */
export const alertNoticeKey = (alert: AlertRef): string =>
  alert.subjectType === 'travel_claim'
    ? `duty_alert:${alert.kind}:${alert.subjectId}`
    : `duty_alert:${alert.id}`;

/**
 * Tells the people an alert names (spec "Nothing goes silent"): a claim not paid goes to
 * finance; anything else to the person's manager (or whoever covers for them), and with no
 * active manager to HR. The person is never told about themself. One notice per alert.
 */
export async function tellAboutAlert(
  db: DatabaseExecutor,
  alert: AlertRef,
  notice: Omit<Notice, 'dedupeKey'>,
): Promise<number> {
  const full: Notice = { ...notice, dedupeKey: alertNoticeKey(alert) };
  if (alert.kind === 'claim_unpaid')
    return notifyHolders(db, TRAVEL_FINANCE_RIGHTS[0], full, alert.personId);
  const [line] = await db
    .select({ managerId: users.id })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(and(eq(reportingLines.userId, alert.personId), eq(users.status, 'active')))
    .limit(1);
  if (line && line.managerId !== alert.personId)
    return notifyCover(db, line.managerId, TRAVEL_HR_RIGHT, full);
  return notifyHolders(db, TRAVEL_HR_RIGHT, full, alert.personId);
}

/**
 * Raises an alert once: a second call for the same kind, subject and day finds it and does
 * nothing, unless it was closed and the cause began again after that (`since`), when it opens
 * again quietly. A new alert tells its people (`tellAboutAlert`) in the same transaction.
 * Returns the alert's id, whether it was new and whether it opened again.
 */
export async function raiseDutyAlert(
  db: DatabaseExecutor,
  input: DutyAlertInput,
  options: RaiseOptions = {},
): Promise<{ readonly id: string; readonly created: boolean; readonly reopened?: boolean }> {
  const now = new Date();
  const [created] = await db
    .insert(dutyAlerts)
    .values({
      kind: input.kind,
      personId: input.personId,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      day: input.day,
      title: input.title,
      detail: input.detail ?? {},
      severity: input.severity ?? DUTY_ALERT_SEVERITY[input.kind],
      ...(options.resolvedReason
        ? { resolvedAt: now, resolvedReason: options.resolvedReason }
        : {}),
    })
    .onConflictDoNothing()
    .returning({ id: dutyAlerts.id });
  if (created) {
    if (options.notify !== false && !options.resolvedReason)
      await tellAboutAlert(
        db,
        {
          id: created.id,
          kind: input.kind,
          personId: input.personId,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        },
        {
          kind: `duty_${input.kind}`,
          title: input.title,
          body: input.body,
          ...(input.opens ? { subject: input.opens } : {}),
        },
      );
    return { id: created.id, created: true };
  }
  const [found] = await db
    .select({ id: dutyAlerts.id, resolvedAt: dutyAlerts.resolvedAt })
    .from(dutyAlerts)
    .where(
      and(
        eq(dutyAlerts.kind, input.kind),
        eq(dutyAlerts.subjectType, input.subjectType),
        eq(dutyAlerts.subjectId, input.subjectId),
        eq(dutyAlerts.day, input.day),
      ),
    )
    .limit(1);
  if (found && input.since && !options.resolvedReason && mayReopen(found.resolvedAt, input.since)) {
    await db
      .update(dutyAlerts)
      .set({
        title: input.title,
        detail: input.detail ?? {},
        severity: input.severity ?? DUTY_ALERT_SEVERITY[input.kind],
        resolvedAt: null,
        resolvedBy: null,
        resolvedReason: null,
      })
      .where(eq(dutyAlerts.id, found.id));
    return { id: found.id, created: false, reopened: true };
  }
  return { id: found?.id ?? '', created: false };
}

/**
 * Closes an open alert: by a person (`byUserId`) or by the system (null), with a reason.
 * Returns false when it was already closed.
 */
export async function resolveDutyAlert(
  db: DatabaseExecutor,
  id: string,
  reason: string | null,
  byUserId: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  const [done] = await db
    .update(dutyAlerts)
    .set({ resolvedAt: now, resolvedBy: byUserId, resolvedReason: reason })
    .where(and(eq(dutyAlerts.id, id), isNull(dutyAlerts.resolvedAt)))
    .returning({ id: dutyAlerts.id });
  return Boolean(done);
}

/**
 * Closes open alerts by the system (no person, no notice), with a reason. Returns how many
 * were still open.
 */
export async function resolveDutyAlerts(
  db: DatabaseExecutor,
  ids: readonly string[],
  reason: string,
  now: Date = new Date(),
): Promise<number> {
  if (ids.length === 0) return 0;
  const done = await db
    .update(dutyAlerts)
    .set({ resolvedAt: now, resolvedBy: null, resolvedReason: reason })
    .where(and(inArray(dutyAlerts.id, [...ids]), isNull(dutyAlerts.resolvedAt)))
    .returning({ id: dutyAlerts.id });
  return done.length;
}

/** "Ravi Patil", for alert titles; "Someone" when the person is gone. */
export async function personName(db: DatabaseExecutor, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.name ?? 'Someone';
}
