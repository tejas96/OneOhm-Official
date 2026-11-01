import { Inject, Injectable } from '@nestjs/common';
import type { DiscomDesk } from '@oneohm/api-contracts';
import {
  changeRequestSteps,
  changeRequests,
  customers,
  discomFollowUps,
  discoms,
  projects,
  projectTasks,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { buildDiscomDesk, type DiscomWait } from './discom-desk-build';

/**
 * Everything waiting on a DISCOM, per DISCOM, with ageing, reference numbers and the
 * next follow-up (PRD 3.16). Utility time is kept apart from OneOhm's own delays.
 */
@Injectable()
export class DiscomDeskService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async desk(): Promise<DiscomDesk> {
    const master = await this.db.select().from(discoms);
    const taskRows = await this.db
      .select({
        task: projectTasks,
        code: projects.code,
        name: projects.name,
        discomId: projects.discomId,
        assigneeName: users.fullName,
        followUp: discomFollowUps,
      })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
      .leftJoin(discomFollowUps, eq(discomFollowUps.taskId, projectTasks.id))
      .where(and(eq(projectTasks.waitingParty, 'discom'), isNotNull(projectTasks.waitingSince)));
    const stepRows = await this.db
      .select({
        step: changeRequestSteps,
        request: changeRequests,
        customerName: customers.name,
        assigneeName: users.fullName,
      })
      .from(changeRequestSteps)
      .innerJoin(changeRequests, eq(changeRequests.id, changeRequestSteps.changeRequestId))
      .innerJoin(customers, eq(customers.id, changeRequests.customerId))
      .leftJoin(users, eq(users.id, changeRequestSteps.assigneeUserId))
      .where(
        and(
          eq(changeRequestSteps.waitingParty, 'discom'),
          isNotNull(changeRequestSteps.waitingSince),
        ),
      );

    const userRef = (id: string | null, name: string | null) =>
      id && name ? { id, fullName: name } : null;
    const waits: DiscomWait[] = [];
    for (const row of taskRows) {
      if (!row.task.waitingSince) continue;
      waits.push({
        kind: 'task',
        id: row.task.id,
        title: row.task.title,
        subject: `${row.code} · ${row.name}`,
        href: `/projects/${row.task.projectId}`,
        assignee: userRef(row.task.assigneeUserId, row.assigneeName),
        discomId: row.discomId,
        since: row.task.waitingSince,
        until: row.task.status === 'completed' ? row.task.completedAt : null,
        waitingNow: row.task.status === 'waiting',
        referenceNumber: row.followUp?.referenceNumber ?? null,
        office: row.followUp?.office ?? null,
        nextFollowUpOn: row.followUp?.nextFollowUpOn ?? null,
        note: row.followUp?.note ?? row.task.note,
      });
    }
    for (const row of stepRows) {
      if (!row.step.waitingSince) continue;
      waits.push({
        kind: 'change_request',
        id: row.step.id,
        title: row.step.title,
        subject: `${row.request.number} · ${row.customerName}`,
        href: `/discom/change-requests/${row.request.id}`,
        assignee: userRef(row.step.assigneeUserId, row.assigneeName),
        discomId: row.request.discomId,
        since: row.step.waitingSince,
        until: row.step.status === 'completed' ? row.step.completedAt : null,
        waitingNow: row.step.status === 'waiting' && row.request.status === 'open',
        referenceNumber: row.request.referenceNumber,
        office: null,
        nextFollowUpOn: row.step.nextFollowUpOn,
        note: row.step.note,
      });
    }
    const [openRequests] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(eq(changeRequests.status, 'open'));
    return buildDiscomDesk(waits, master, todayIn(), openRequests?.count ?? 0);
  }

  async updateFollowUp(
    actor: Actor,
    taskId: string,
    input: {
      referenceNumber?: string | null | undefined;
      office?: string | null | undefined;
      nextFollowUpOn?: string | null | undefined;
      note?: string | null | undefined;
    },
  ): Promise<{ taskId: string }> {
    const [task] = await this.db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(eq(projectTasks.id, taskId));
    if (!task) throw notFound('That task');
    const values = {
      ...(input.referenceNumber !== undefined ? { referenceNumber: input.referenceNumber } : {}),
      ...(input.office !== undefined ? { office: input.office } : {}),
      ...(input.nextFollowUpOn !== undefined ? { nextFollowUpOn: input.nextFollowUpOn } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      updatedByUserId: actor.userId,
      updatedAt: new Date(),
    };
    await this.db
      .insert(discomFollowUps)
      .values({ taskId, ...values })
      .onConflictDoUpdate({ target: discomFollowUps.taskId, set: values });
    await recordAudit(this.db, actor.userId, 'discom.follow_up', 'task', taskId, input);
    return { taskId };
  }
}
