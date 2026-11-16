import { projectTasks } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import type { Database } from '../../config/core.module';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { followAssignee, lockVisitTarget } from '../visits/follow-assignee';
import { tellAssignee } from './task-notices';

/**
 * Gives a task to someone (or nobody), in one transaction: a contractor's crew member's task
 * joins the work order, an open planned visit's crew follows, the change is audited and the
 * new person is told. The customer of a confirmed visit hears who comes, unless `tellCustomer`
 * is false (the live map's "Send nearest"). The caller checks the right (`tasks.assign`).
 */
export async function assignTask(
  db: Database,
  actor: Actor,
  id: string,
  userId: string | null,
  tellCustomer = true,
): Promise<void> {
  const [task] = await db.select().from(projectTasks).where(eq(projectTasks.id, id));
  if (!task) throw notFound('That task');
  await db.transaction(async (tx) => {
    await lockVisitTarget(tx, { taskId: id });
    await tx
      .update(projectTasks)
      .set({ assigneeUserId: userId, updatedAt: new Date() })
      .where(eq(projectTasks.id, id));
    await syncWorkOrders(tx, task.projectId, actor.userId);
    await followAssignee(tx, { taskId: id }, userId, actor.userId, undefined, tellCustomer);
    await recordAudit(tx, actor.userId, 'task.assigned', 'task', id, { userId });
    await tellAssignee(tx, task, userId, actor.userId);
  });
}
