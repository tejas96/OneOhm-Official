import { type DatabaseExecutor, visits } from '@oneohm/database';
import { freeSlots, isPresenceKind, type VisitSlot } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq, sql } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import { takenSlots } from './visit-capacity';
import {
  followTaskDates,
  logVisit,
  mirrorServiceDay,
  revertSurveyOnLead,
  settleVisitActions,
  surveyOnLead,
  type VisitRow,
} from './visit-effects';
import { dayWords } from './visit-messages';
import type { VisitTarget } from './visit-reads';

const say = (day: string, slot: VisitSlot) => `${dayWords(day)}, ${slot}`;

export interface SaveVisit {
  readonly day: string;
  readonly slot: VisitSlot;
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
  await lockCrewDay(tx, target, input.day);
  if (!isPresenceKind(target.kind)) {
    // Two taps (or a tap and the desk) at once take turns: the slot is checked again inside the lock.
    const taken = await takenSlots(tx, target.crew, todayIn(), existing?.id);
    if (!freeSlots(taken[input.day] ?? []).includes(input.slot))
      throw conflict(
        'The person who comes already has a visit then. Pick another time.',
        'slot_taken',
      );
  }
  const moved = Boolean(existing && (existing.day !== input.day || existing.slot !== input.slot));
  let saved: VisitRow | undefined;
  if (existing) {
    [saved] = await tx
      .update(visits)
      .set({ day: input.day, slot: input.slot, status: input.status, ...stamp, ...fresh })
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
        slot: input.slot,
        crewUserIds: [...target.crew],
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
  const when = say(input.day, input.slot);
  if (confirmed) {
    if (row.taskId) await followTaskDates(tx, row.taskId, input.day);
    await settleVisitActions(tx, row, 'closed', ['visit_pick']);
  }
  // The service request shows the day only once the team have confirmed it.
  if (row.serviceRequestId)
    await mirrorServiceDay(tx, row.serviceRequestId, confirmed ? input.day : null);
  if (row.leadId && row.kind === 'survey')
    await surveyOnLead(tx, row.leadId, input.userId, input.day, input.slot);
  await logVisit(
    tx,
    row,
    input.userId,
    confirmed ? (moved ? 'visit.moved' : 'visit.confirmed') : 'visit.proposed',
    confirmed
      ? `${target.title}: visit ${moved ? 'moved to' : 'booked for'} ${when}`
      : `${target.title}: the customer picked ${when} (waiting for the team to confirm)`,
    { day: input.day, slot: input.slot, by: input.by },
  );
}

/** Cancelled: the service request's day is cleared, the waiting asks are cancelled. */
export async function cancelVisit(
  tx: DatabaseExecutor,
  row: VisitRow,
  userId: string | null,
  reason: string,
  title: string,
): Promise<VisitRow> {
  const now = new Date();
  const [updated] = await tx
    .update(visits)
    .set({ status: 'cancelled', cancelledAt: now, cancelReason: reason, updatedAt: now })
    .where(eq(visits.id, row.id))
    .returning();
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
    `${title}: visit on ${say(row.day, row.slot)} cancelled`,
    {
      reason,
    },
  );
  return updated ?? row;
}

/** The visit happened. */
export async function finishVisit(
  tx: DatabaseExecutor,
  row: VisitRow,
  userId: string | null,
  title: string,
): Promise<VisitRow> {
  const now = new Date();
  const [updated] = await tx
    .update(visits)
    .set({ status: 'done', doneAt: now, updatedAt: now })
    .where(eq(visits.id, row.id))
    .returning();
  await settleVisitActions(tx, row, 'closed', ['presence', 'visit_pick']);
  await logVisit(
    tx,
    row,
    userId,
    'visit.done',
    `${title}: visit on ${say(row.day, row.slot)} done`,
  );
  return updated ?? row;
}

/** The customer said [Confirm] / [I'll be there]. */
export async function customerConfirmed(
  tx: DatabaseExecutor,
  row: VisitRow,
  title: string,
): Promise<void> {
  await tx
    .update(visits)
    .set({ customerConfirmedAt: new Date(), customerCannotAt: null, updatedAt: new Date() })
    .where(eq(visits.id, row.id));
  await settleVisitActions(tx, row, 'closed', ['presence']);
  await logVisit(
    tx,
    row,
    null,
    'visit.customer_confirmed',
    `${title}: the customer confirmed ${say(row.day, row.slot)}`,
  );
}

/** One person's day is saved by one transaction at a time (the lock lets go when it ends). */
async function lockCrewDay(tx: DatabaseExecutor, target: VisitTarget, day: string) {
  // The thing itself too, so two answers to one ask take turns even with no crew named.
  const thing = target.taskId ?? target.serviceRequestId ?? target.leadId ?? '';
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`visit-target:${thing}`}))`);
  for (const person of [...target.crew].sort())
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`visit:${person}:${day}`}))`);
}
