import { Inject, Injectable } from '@nestjs/common';
import type { ProjectTask } from '@oneohm/api-contracts';
import {
  documents,
  projectActivities,
  projectFacts,
  projectTasks,
  taskDependencies,
} from '@oneohm/database';
import { factLabel, missingEvidence, type WaitingParty } from '@oneohm/domain';
import { and, eq, isNull, ne, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { presentTasks } from '../../common/read-models/project-tasks';
import { DATABASE, type Database } from '../../config/core.module';
import { canViewTask } from './task-access';
import { finishTask, missingCaptures } from './task-completion';

const WAITING_ON: Readonly<Record<WaitingParty, string>> = {
  discom: 'DISCOM',
  bank: 'the bank',
  customer: 'the customer',
  internal: 'the OneOhm team',
};

@Injectable()
export class TasksService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** What the person should do: their open tasks, soonest first. */
  async mine(actor: Actor): Promise<ProjectTask[]> {
    return presentTasks(
      this.db,
      and(eq(projectTasks.assigneeUserId, actor.userId), ne(projectTasks.status, 'completed')) ??
        eq(projectTasks.assigneeUserId, actor.userId),
    );
  }

  /** One task, for its assignee, approvers and people who see every project. */
  async get(actor: Actor, id: string): Promise<ProjectTask> {
    const [row] = await this.db
      .select({ assigneeUserId: projectTasks.assigneeUserId })
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!row || !canViewTask(actor, row)) throw notFound('That task');
    return this.present(id);
  }

  async start(actor: Actor, id: string): Promise<ProjectTask> {
    const task = await this.load(actor, id);
    await this.assertUnblocked(id);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    await this.db
      .update(projectTasks)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        waitingSince: null,
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, id));
    return this.present(id);
  }

  async markWaiting(
    actor: Actor,
    id: string,
    party: WaitingParty,
    note: string | null | undefined,
  ): Promise<ProjectTask> {
    const task = await this.load(actor, id);
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({
          status: 'waiting',
          waitingParty: party,
          waitingSince: new Date(),
          note: note ?? task.note,
          updatedAt: new Date(),
        })
        .where(eq(projectTasks.id, id));
      await tx.insert(projectActivities).values({
        projectId: task.projectId,
        taskId: id,
        kind: 'waiting',
        message: `${task.title}: waiting on ${WAITING_ON[party]}${note ? ` (${note})` : ''}.`,
        userId: actor.userId,
      });
    });
    return this.present(id);
  }

  /** Needs every fact the task captures; approval tasks go to review instead of finishing. */
  async complete(
    actor: Actor,
    id: string,
    facts: Record<string, string>,
    note: string | null | undefined,
  ): Promise<ProjectTask> {
    const task = await this.load(actor, id);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    await this.assertUnblocked(id);
    const known = await this.db
      .select({ key: projectFacts.key })
      .from(projectFacts)
      .where(eq(projectFacts.projectId, task.projectId));
    const missing = missingCaptures(task.captures, facts, new Set(known.map((fact) => fact.key)));
    if (missing.length > 0) {
      throw invalid(
        'Add the details this task records before completing it.',
        Object.fromEntries(missing.map((key) => [key, `${factLabel(key)} is required.`])),
      );
    }
    await this.assertEvidence(id, task.evidence);
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(facts)) {
        if (!value.trim()) continue;
        await tx
          .insert(projectFacts)
          .values({ projectId: task.projectId, key, value: value.trim(), capturedByTaskId: id })
          .onConflictDoUpdate({
            target: [projectFacts.projectId, projectFacts.key],
            set: { value: value.trim(), capturedByTaskId: id, updatedAt: new Date() },
          });
      }
      if (note) await tx.update(projectTasks).set({ note }).where(eq(projectTasks.id, id));
      if (task.approval && !can(actor, 'tasks.approve')) {
        await tx
          .update(projectTasks)
          .set({ status: 'in_review', updatedAt: new Date() })
          .where(eq(projectTasks.id, id));
        await tx.insert(projectActivities).values({
          projectId: task.projectId,
          taskId: id,
          kind: 'review',
          message: `${task.title} sent for approval.`,
          userId: actor.userId,
        });
      } else {
        await finishTask(tx, task, actor.userId);
      }
      await recordAudit(tx, actor.userId, 'task.completed', 'task', id, {
        facts: Object.keys(facts),
      });
    });
    return this.present(id);
  }

  async approve(actor: Actor, id: string): Promise<ProjectTask> {
    assertCan(actor, 'tasks.approve');
    const [task] = await this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!task) throw notFound('That task');
    if (task.status !== 'in_review')
      throw conflict('This task is not waiting for approval.', 'not_in_review');
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({ approvedByUserId: actor.userId })
        .where(eq(projectTasks.id, id));
      await finishTask(tx, task, actor.userId);
    });
    return this.present(id);
  }

  async assign(actor: Actor, id: string, userId: string | null): Promise<ProjectTask> {
    assertCan(actor, 'tasks.assign');
    const [task] = await this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!task) throw notFound('That task');
    await this.db
      .update(projectTasks)
      .set({ assigneeUserId: userId, updatedAt: new Date() })
      .where(eq(projectTasks.id, id));
    await recordAudit(this.db, actor.userId, 'task.assigned', 'task', id, { userId });
    return this.present(id);
  }

  private async load(actor: Actor, id: string) {
    const [task] = await this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!task) throw notFound('That task');
    const mine = task.assigneeUserId === actor.userId;
    if (!mine && !can(actor, 'tasks.assign') && !can(actor, 'projects.manage'))
      throw forbidden('Only the assignee or a manager can update this task.');
    return task;
  }

  private async assertUnblocked(id: string): Promise<void> {
    const blockers = await this.db
      .select({ title: projectTasks.title })
      .from(taskDependencies)
      .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
      .where(and(eq(taskDependencies.taskId, id), ne(projectTasks.status, 'completed')));
    if (blockers.length > 0)
      throw conflict(
        `Waiting for: ${blockers.map((blocker) => blocker.title).join(', ')}.`,
        'blocked',
      );
  }

  /** PRD 4.4: a task that needs site photos completes only once one is attached. */
  private async assertEvidence(id: string, required: readonly string[]): Promise<void> {
    const attached = await this.db
      .select({ contentType: documents.contentType })
      .from(documents)
      .where(
        and(eq(documents.taskId, id), isNull(documents.replacedAt), isNull(documents.removedAt)),
      );
    const missing = missingEvidence(
      required,
      attached.map((file) => file.contentType),
    );
    if (missing.includes('photo')) {
      throw conflict(
        'Add at least one site photo before completing this task.',
        'evidence_missing',
      );
    }
  }

  private async present(id: string): Promise<ProjectTask> {
    const [task] = await presentTasks(
      this.db,
      or(eq(projectTasks.id, id)) ?? eq(projectTasks.id, id),
    );
    if (!task) throw notFound('That task');
    return task;
  }
}
