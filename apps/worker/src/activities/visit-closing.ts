import {
  alertVisitOwner,
  type Database,
  projectActivities,
  serviceRequests,
  visits,
} from '@oneohm/database';
import { confirmDeadline, visitDayLabel } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { claimAlert, type Row } from './visit-row';

/** The customer's pick still waits for the team after the time we promised: the owner is told. */
export async function alertProposed(db: Database, row: Row, now: Date, timeZone: string) {
  if (row.unconfirmedAlertAt || now < confirmDeadline(row.createdAt, timeZone)) return false;
  if (!(await claimAlert(db, row, now))) return false;
  await alertVisitOwner(db, row, {
    kind: 'visit_pick_waiting',
    title: `${row.customer}'s pick for ${visitDayLabel(row.day, 'en')} is still waiting`,
    body: 'We told them we would confirm by now. Confirm the day or change it.',
    key: `visit_pick_waiting:${row.id}`,
  });
  return true;
}

/** The task was completed or the request resolved: the visit happened, whoever did not tick it. */
export async function markDone(db: Database, row: Row, now: Date): Promise<boolean> {
  const marked = await db
    .update(visits)
    .set({ status: 'done', doneAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), inArray(visits.status, ['confirmed', 'missed'])))
    .returning({ id: visits.id });
  return marked.length > 0;
}

/** Not marked done by the end of its day: missed; the owner decides (done late, or a new day). */
export async function markMissed(db: Database, row: Row, now: Date): Promise<boolean> {
  const marked = await db
    .update(visits)
    .set({ status: 'missed', missedAt: now, updatedAt: now })
    .where(and(eq(visits.id, row.id), inArray(visits.status, ['proposed', 'confirmed'])))
    .returning({ id: visits.id });
  if (marked.length === 0) return false;
  // The ticket must not keep showing a day that has gone by.
  if (row.serviceRequestId)
    await db
      .update(serviceRequests)
      .set({ visitOn: null, updatedAt: now })
      .where(eq(serviceRequests.id, row.serviceRequestId));
  const day = visitDayLabel(row.day, 'en');
  const never = row.status === 'proposed';
  if (row.projectId)
    await db.insert(projectActivities).values({
      projectId: row.projectId,
      taskId: row.taskId,
      kind: 'visit',
      message: never
        ? `The customer's pick for ${day} was never confirmed`
        : `Visit on ${day} was not marked done: marked missed`,
      data: { visitId: row.id },
    });
  await alertVisitOwner(db, row, {
    kind: 'visit_missed',
    title: never
      ? `${row.customer}'s pick for ${day} was never confirmed`
      : `Visit to ${row.customer} on ${day} was not marked done`,
    body: never
      ? 'The day has passed. Book a new day with the customer.'
      : 'Mark it done if it happened, or book a new day with the customer.',
    key: `visit_missed:${row.id}`,
  });
  return true;
}
