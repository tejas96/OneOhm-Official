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
  taskWaits,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { buildDiscomDesk, type DiscomWait } from './discom-desk-build';

const userRef = (id: string | null, name: string | null) =>
  id && name ? { id, fullName: name } : null;

/**
 * Everything waiting on a DISCOM, per DISCOM, with ageing, reference numbers and the
 * next follow-up (PRD 3.16). Utility time is kept apart from OneOhm's own delays.
 */
@Injectable()
export class DiscomDeskService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async desk(): Promise<DiscomDesk> {
    const master = await this.db.select().from(discoms);
    const waits = [...(await this.taskWaitsOnDiscom()), ...(await this.stepWaitsOnDiscom())];
    const [openRequests] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(changeRequests)
      .where(eq(changeRequests.status, 'open'));
    return buildDiscomDesk(waits, master, todayIn(), openRequests?.count ?? 0);
  }

  /** Project tasks waiting on a DISCOM now, or that did before they were resumed. */
  private async taskWaitsOnDiscom(): Promise<DiscomWait[]> {
    // Earlier DISCOM waits of tasks that were resumed, so they still count (PRD 3.16).
    const earlier = await this.db
      .select({ taskId: taskWaits.taskId, from: taskWaits.startedAt, to: taskWaits.endedAt })
      .from(taskWaits)
      .where(eq(taskWaits.party, 'discom'));
    const resumed = [...new Set(earlier.map((row) => row.taskId))];
    const rows = await this.db
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
      .where(
        or(
          and(eq(projectTasks.waitingParty, 'discom'), isNotNull(projectTasks.waitingSince)),
          resumed.length > 0 ? inArray(projectTasks.id, resumed) : undefined,
        ),
      );
    return rows.map(({ task, followUp, ...row }) => {
      const current = task.waitingParty === 'discom' ? task.waitingSince : null;
      return {
        kind: 'task',
        id: task.id,
        title: task.title,
        subject: `${row.code} · ${row.name}`,
        href:
          task.status === 'waiting'
            ? `/command-center/tasks?show=waiting&party=discom&project=${task.projectId}`
            : `/projects/${task.projectId}?tab=tasks&layout=list`,
        assignee: userRef(task.assigneeUserId, row.assigneeName),
        discomId: row.discomId,
        since: current,
        until: task.status === 'completed' ? task.completedAt : null,
        earlier: earlier.filter((wait) => wait.taskId === task.id),
        finished: task.status === 'completed',
        waitingNow: task.status === 'waiting' && current !== null,
        referenceNumber: followUp?.referenceNumber ?? null,
        office: followUp?.office ?? null,
        nextFollowUpOn: followUp?.nextFollowUpOn ?? null,
        note: followUp?.note ?? task.note,
      };
    });
  }

  /** Change-request steps that wait (or waited) on a DISCOM. */
  private async stepWaitsOnDiscom(): Promise<DiscomWait[]> {
    const rows = await this.db
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
    return rows.map(({ step, request, ...row }) => ({
      kind: 'change_request',
      id: step.id,
      title: step.title,
      subject: `${request.number} · ${row.customerName}`,
      href: `/discom/change-requests/${request.id}`,
      assignee: userRef(step.assigneeUserId, row.assigneeName),
      discomId: request.discomId,
      since: step.waitingSince,
      until: step.status === 'completed' ? step.completedAt : null,
      earlier: [],
      finished: step.status === 'completed',
      waitingNow: step.status === 'waiting' && request.status === 'open',
      referenceNumber: request.referenceNumber,
      office: null,
      nextFollowUpOn: step.nextFollowUpOn,
      note: step.note,
    }));
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
