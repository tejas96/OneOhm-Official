import {
  type DatabaseExecutor,
  projectActivities,
  projectChanges,
  quotations,
} from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';

/**
 * The team drops an open change (PRD 3.15): a drafted or sent revision closes with it, so
 * the customer cannot accept it later, and the project stays exactly as it was.
 */
export async function withdrawChange(
  db: DatabaseExecutor,
  userId: string,
  change: typeof projectChanges.$inferSelect,
  reason: string,
): Promise<void> {
  if (change.quotationId)
    await db
      .update(quotations)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: `Change withdrawn: ${reason}`,
        updatedAt: new Date(),
      })
      .where(
        and(eq(quotations.id, change.quotationId), inArray(quotations.status, ['draft', 'sent'])),
      );
  await db
    .update(projectChanges)
    .set({
      status: 'withdrawn',
      closeReason: reason,
      closedAt: new Date(),
      closedByUserId: userId,
      updatedAt: new Date(),
    })
    .where(eq(projectChanges.id, change.id));
  await db.insert(projectActivities).values({
    projectId: change.projectId,
    kind: 'scope_change',
    message: `Change ${change.number} withdrawn: ${reason}. The project stays as it was.`,
    userId,
  });
  await recordAudit(db, userId, 'project.change_withdrawn', 'project', change.projectId, {
    changeId: change.id,
    reason,
  });
}
