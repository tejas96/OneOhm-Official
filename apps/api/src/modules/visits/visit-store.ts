import { type DatabaseExecutor, visits } from '@oneohm/database';
import { isPresenceKind, type VisitSlot } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import {
  followTaskDates,
  logVisit,
  mirrorServiceDay,
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
    toldAt: confirmed && isPresenceKind(target.kind) ? now : null,
    updatedAt: now,
  };
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
  const when = say(input.day, input.slot);
  if (confirmed) {
    if (row.taskId) await followTaskDates(tx, row.taskId, input.day);
    await settleVisitActions(tx, row, 'closed', ['visit_pick']);
  }
  if (row.serviceRequestId) await mirrorServiceDay(tx, row.serviceRequestId, input.day);
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
  return { row, moved };
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
  await settleVisitActions(tx, row, 'closed', ['presence']);
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
