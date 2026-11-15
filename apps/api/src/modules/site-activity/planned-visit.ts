import { type DatabaseExecutor, visits } from '@oneohm/database';
import { marksPlannedVisitDone, pickPlannedVisit } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { finishVisit } from '../visits/visit-store';

/**
 * The planned visit (the booking in Visits) a site check-in is for (live review S6): the
 * one on that day for the task or the service request, if there is one. The check-in keeps
 * its id in `visit_id`.
 */
export async function plannedVisitFor(
  db: DatabaseExecutor,
  scope: { readonly taskId: string } | { readonly serviceRequestId: string },
  day: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: visits.id, status: visits.status, day: visits.day })
    .from(visits)
    .where(
      and(
        'taskId' in scope
          ? eq(visits.taskId, scope.taskId)
          : eq(visits.serviceRequestId, scope.serviceRequestId),
        eq(visits.day, day),
        inArray(visits.status, ['proposed', 'confirmed']),
      ),
    );
  return pickPlannedVisit(rows, day);
}

/**
 * The person checked out: the planned visit it was linked to is done, if it is still
 * confirmed. It runs the same step as finishing the task (`finishVisit`: the visit's
 * history, its open prompts closed), and that step sends no customer message itself; the
 * "work done" message belongs to completing the task. A manager's force-close and the end
 * of the day never call this: the visit is not known to have happened.
 */
export async function finishLinkedVisit(
  db: DatabaseExecutor,
  plannedVisitId: string | null,
  userId: string,
  title: string,
): Promise<void> {
  if (!plannedVisitId) return;
  const [row] = await db.select().from(visits).where(eq(visits.id, plannedVisitId)).limit(1);
  if (!row || !marksPlannedVisitDone(row.status)) return;
  await finishVisit(db, row, userId, title);
}
