import { Inject, Injectable } from '@nestjs/common';
import { contractorMembers, projectActivities, projectTasks, users } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { followAssignee, lockVisitTarget } from '../visits/follow-assignee';
import { tellAssignee } from './task-notices';

/**
 * Critical tasks are only proposed to someone (PRD 3.8); a manager confirms that person
 * or picks another, and only then is the person told.
 */
@Injectable()
export class AssignmentConfirmService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async confirm(actor: Actor, taskId: string, userId: string): Promise<void> {
    const [task] = await this.db.select().from(projectTasks).where(eq(projectTasks.id, taskId));
    if (!task) throw notFound('That task');
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    const [person] = await this.db
      .select({ name: users.fullName, crew: contractorMembers.contractorId })
      .from(users)
      .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
      .where(and(eq(users.id, userId), eq(users.status, 'active')));
    if (!person) throw invalid('Pick an active person.', { userId: 'Unknown or inactive.' });
    const changed = task.proposedUserId !== null && task.proposedUserId !== userId;
    await this.db.transaction(async (tx) => {
      await lockVisitTarget(tx, { taskId });
      await tx
        .update(projectTasks)
        .set({ assigneeUserId: userId, proposedUserId: null, updatedAt: new Date() })
        .where(eq(projectTasks.id, taskId));
      // A crew member's task joins their contractor's work order.
      await syncWorkOrders(tx, task.projectId, actor.userId);
      await followAssignee(tx, { taskId }, userId, actor.userId);
      await tx.insert(projectActivities).values({
        projectId: task.projectId,
        taskId,
        kind: 'assignment_confirmed',
        message: `${task.title}: ${actor.fullName} ${changed ? 'gave it to' : 'confirmed'} ${person.name}.`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'task.assignment_confirmed', 'task', taskId, {
        userId,
        proposedUserId: task.proposedUserId,
      });
      await tellAssignee(tx, task, userId, actor.userId);
    });
  }
}
