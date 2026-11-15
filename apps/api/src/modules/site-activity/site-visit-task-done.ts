import { projectActivities, siteVisits, type Transaction } from '@oneohm/database';
import { visitCloseAt } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { afterSiteCheckOut } from '../workforce/site-hooks';
import { finishLinkedVisit } from './planned-visit';
import { durationWords } from './site-visit-read';

/**
 * Finishing a task ends every open site visit on it (Duty Day step 3), whoever is on the crew:
 * the work is done, so nobody is "at the site for it" and nobody has to check out by hand. Runs inside the
 * completion transaction. The visit closes at completion time (never before it began) with
 * `task_complete`, and the planned visit it was for is marked done by the same step as a
 * check-out (`finishLinkedVisit`). Running again finds nothing open.
 */
export async function closeVisitsOnTaskDone(
  tx: Transaction,
  task: { readonly id: string; readonly title: string; readonly projectId: string },
  at: Date,
): Promise<void> {
  const open = await tx
    .select()
    .from(siteVisits)
    .where(and(eq(siteVisits.taskId, task.id), isNull(siteVisits.checkOutAt)));
  for (const visit of open) {
    const closedAt = visitCloseAt(visit.checkInAt, at);
    const [done] = await tx
      .update(siteVisits)
      .set({
        checkOutAt: closedAt,
        checkOutSource: 'task_complete',
        closeKind: 'self',
        updatedAt: at,
      })
      .where(and(eq(siteVisits.id, visit.id), isNull(siteVisits.checkOutAt)))
      .returning({ id: siteVisits.id });
    if (!done) continue;
    await afterSiteCheckOut(tx, visit.userId, visit.id, null);
    await finishLinkedVisit(tx, visit.visitId, visit.userId, task.title);
    const minutes = Math.max(
      0,
      Math.round((closedAt.getTime() - visit.checkInAt.getTime()) / 60_000),
    );
    await tx.insert(projectActivities).values({
      projectId: task.projectId,
      taskId: task.id,
      kind: 'site_check_out',
      message: `Checked out of the site when ${task.title} was completed, after ${durationWords(minutes)}.`,
      userId: visit.userId,
      data: { visitId: visit.id, minutes, source: 'task_complete' },
    });
  }
}
