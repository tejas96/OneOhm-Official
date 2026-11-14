import { type DatabaseExecutor, visits } from '@oneohm/database';
import { isPresenceKind, OPEN_VISIT_STATUSES, slotHalf, type VisitSlot } from '@oneohm/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import {
  followTaskDates,
  logVisit,
  mirrorServiceDay,
  revertSurveyOnLead,
  settleVisitActions,
  surveyOnLead,
  type VisitRow,
} from './visit-effects';
import { lockVisitTarget } from './visit-lock';
import { scopeOfRow, targetOf, type VisitTarget } from './visit-reads';
import { timesFor, visitRules } from './visit-times';

import { visitWhen as say } from './visit-when';

export interface SaveVisit {
  readonly day: string;
  /** Kept for older callers; the exact time is `startMin` (else the first free time in this half). */
  readonly slot: VisitSlot;
  /** Start of the visit in minutes after midnight; it ends after the visit length in Settings. */
  readonly startMin?: number;
  readonly status: 'proposed' | 'confirmed';
  readonly by: 'customer' | 'staff';
  readonly userId: string | null;
}

/**
 * Saves a visit for a target: a new row, or the open one moved (day, slot, status). A confirmed
 * visit carries the planned dates of its task, the service request's visit day, and the survey
 * lead's stage. Returns the row and whether an earlier day was moved.
 */
export async function saveVisit(
  tx: DatabaseExecutor,
  target: VisitTarget,
  input: SaveVisit,
  existing: VisitRow | null,
  now = new Date(),
  timeZone = 'Asia/Kolkata',
): Promise<{ row: VisitRow; moved: boolean }> {
  const confirmed = input.status === 'confirmed';
  const stamp = confirmed
    ? { confirmedAt: now, confirmedByUserId: input.userId }
    : { confirmedAt: null, confirmedByUserId: null };
  const fresh = {
    customerConfirmedAt: null,
    customerCannotAt: null,
    reminderSentAt: null,
    unconfirmedAlertAt: null,
    // A DISCOM date is told the moment it is saved; the 1-day check counts from then.
    toldAt: confirmed && isPresenceKind(target.kind) && target.mayMessage ? now : null,
    updatedAt: now,
  };
  // Locks first, in the same order as a reassignment, then the crew as it is now (not as it was read).
  await lockVisitTarget(tx, scopeOfRow(target));
  const crew = (await targetOf(tx, scopeOfRow(target))).crew;
  await lockCrewDay(tx, crew, input.day);
  let time: { startMin: number; endMin: number } | null = null;
  if (!isPresenceKind(target.kind)) {
    // Two taps (or a tap and the desk) at once take turns: the time is checked again inside the lock.
    const free = await timesFor(tx, input.day, {
      crew,
      who: input.by,
      now,
      timeZone,
      ...(existing ? { exceptVisitId: existing.id } : {}),
    });
    const kept =
      existing && existing.day === input.day && existing.startMin === input.startMin
        ? existing
        : null;
    const chosen =
      input.startMin !== undefined
        ? free.find((slot) => slot.startMin === input.startMin)
        : free.find((slot) => slotHalf(slot.startMin) === input.slot);
    if (chosen) time = { startMin: chosen.startMin, endMin: chosen.endMin };
    else if (kept?.startMin != null && kept.endMin != null)
      // Re-confirming the visit as it is (a time that is no longer offered stays as it was).
      time = { startMin: kept.startMin, endMin: kept.endMin };
    else
      throw conflict(
        'The person who comes already has a visit then. Pick another time.',
        'slot_taken',
      );
  } else if (input.startMin !== undefined) {
    const { settings } = await visitRules(tx, timeZone);
    time = { startMin: input.startMin, endMin: input.startMin + settings.visitMinutes };
  }
  const slot = time ? slotHalf(time.startMin) : input.slot;
  const moved = Boolean(
    existing &&
      (existing.day !== input.day ||
        existing.slot !== slot ||
        (time !== null && existing.startMin !== time.startMin)),
  );
  let saved: VisitRow | undefined;
  if (existing) {
    [saved] = await tx
      .update(visits)
      .set({
        day: input.day,
        slot,
        startMin: time?.startMin ?? null,
        endMin: time?.endMin ?? null,
        status: input.status,
        ...stamp,
        ...fresh,
        // A new pick starts the promise to confirm it afresh.
        ...(input.status === 'proposed' ? { createdAt: now } : {}),
      })
      .where(eq(visits.id, existing.id))
      .returning();
  } else {
    [saved] = await tx
      .insert(visits)
      .values({
        kind: target.kind,
        status: input.status,
        customerId: target.customerId,
        projectId: target.projectId,
        leadId: target.leadId,
        serviceRequestId: target.serviceRequestId,
        amcVisitId: target.amcVisitId,
        taskId: target.taskId,
        propertyId: target.propertyId,
        day: input.day,
        slot,
        startMin: time?.startMin ?? null,
        endMin: time?.endMin ?? null,
        crewUserIds: [...crew],
        proposedBy: input.by,
        proposedByUserId: input.by === 'staff' ? input.userId : null,
        ...stamp,
        ...fresh,
      })
      .returning();
  }
  if (!saved) throw new Error('The visit was not saved.');
  const row = saved;
  await followVisit(tx, target, row, input, moved);
  return { row, moved };
}

/** What a saved visit changes around it: the task, the service request, the lead, the waiting ask and the log. */
async function followVisit(
  tx: DatabaseExecutor,
  target: VisitTarget,
  row: VisitRow,
  input: SaveVisit,
  moved: boolean,
): Promise<void> {
  const confirmed = input.status === 'confirmed';
  const when = say(row.day, row.slot, row.startMin, row.endMin);
  if (confirmed) {
    if (row.taskId) await followTaskDates(tx, row.taskId, input.day);
    await settleVisitActions(tx, row, 'closed', ['visit_pick']);
  }
  // The service request shows the day only once the team have confirmed it.
  if (row.serviceRequestId)
    await mirrorServiceDay(tx, row.serviceRequestId, confirmed ? input.day : null);
  if (row.leadId && row.kind === 'survey')
    await surveyOnLead(tx, row.leadId, input.userId, row.day, row.slot, row.startMin);
  await logVisit(
    tx,
    row,
    input.userId,
    confirmed ? (moved ? 'visit.moved' : 'visit.confirmed') : 'visit.proposed',
    confirmed
      ? `${target.title}: visit ${moved ? 'moved to' : 'booked for'} ${when}`
      : `${target.title}: the customer picked ${when} (waiting for the team to confirm)`,
    { day: row.day, slot: row.slot, startMin: row.startMin, by: input.by },
  );
}

/**
 * Cancelled: the service request's day is cleared, the waiting asks are cancelled. Only a proposed or
 * confirmed visit is cancelled; one that changed meanwhile is left alone and `null` is returned.
 */
export async function cancelVisit(
  tx: DatabaseExecutor,
  row: VisitRow,
  userId: string | null,
  reason: string,
  title: string,
): Promise<VisitRow | null> {
  const now = new Date();
  const [updated] = await tx
    .update(visits)
    .set({ status: 'cancelled', cancelledAt: now, cancelReason: reason, updatedAt: now })
    .where(and(eq(visits.id, row.id), inArray(visits.status, OPEN_VISIT_STATUSES)))
    .returning();
  if (!updated) return null;
  if (row.serviceRequestId) await mirrorServiceDay(tx, row.serviceRequestId, null);
  await settleVisitActions(tx, row, 'cancelled', ['presence']);
  // A pick the customer made and the team now cancel is not waiting for a check any more.
  await settleVisitActions(tx, row, 'cancelled', ['visit_pick'], ['received']);
  if (row.leadId && row.kind === 'survey' && !row.taskId && !row.serviceRequestId)
    await revertSurveyOnLead(tx, row.leadId, userId);
  await logVisit(
    tx,
    row,
    userId,
    'visit.cancelled',
    `${title}: visit on ${say(row.day, row.slot, row.startMin, row.endMin)} cancelled`,
    {
      reason,
    },
  );
  return updated;
}

/** One person's day is saved by one transaction at a time (the lock lets go when it ends). */
async function lockCrewDay(tx: DatabaseExecutor, crew: readonly string[], day: string) {
  for (const person of [...crew].sort())
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`visit:${person}:${day}`}))`);
}

export { customerConfirmed, finishVisit } from './visit-finish';
