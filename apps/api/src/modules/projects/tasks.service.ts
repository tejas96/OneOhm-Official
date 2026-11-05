import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ProjectTask } from '@oneohm/api-contracts';
import { projectActivities, projectFacts, projectTasks } from '@oneohm/database';
import { factLabel, measurementsFor, type WaitingParty } from '@oneohm/domain';
import { and, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { presentTasks } from '../../common/read-models/project-tasks';
import { DATABASE, type Database } from '../../config/core.module';
import { settleWorkOrderForTask } from '../contractors/work-order-settle';
import { syncWorkOrders } from '../contractors/work-order-sync';
import { ReportArchiveService } from '../reports/report-archive.service';
import { StalePaperAsksService } from '../reports/stale-paper-asks.service';
import { followAssignee, lockVisitTarget } from '../visits/follow-assignee';
import { BudgetCheckService, SURVEY_FACTS } from './budget-check.service';
import { checkHandoverMaterial, recordHandoverOverride } from './handover-material';
import { canViewTask } from './task-access';
import { finishTask, missingCaptures } from './task-completion';
import { assertEvidence, assertUnblocked, checkedConsumerNumber } from './task-guards';
import { tellCustomerAbout, waitStarted } from './task-messages';
import { tellApproved, tellAssignee, tellHelpAsked } from './task-notices';
import { assertMayReview, closeReview, sendForReview } from './task-review';
import { closeOpenWait, nextWaitStart } from './task-waits';

const WAITING_ON: Readonly<Record<WaitingParty, string>> = {
  discom: 'DISCOM',
  bank: 'the bank',
  customer: 'the customer',
  internal: 'our team',
};

@Injectable()
export class TasksService {
  private readonly log = new Logger('Tasks');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly budget: BudgetCheckService,
    private readonly archive: ReportArchiveService,
    private readonly stale: StalePaperAsksService,
  ) {}

  /**
   * After a task finishes: reports whose data changed are saved again (in the background),
   * and a finished survey re-prices the quote. Neither ever undoes the task.
   */
  private async afterFinish(actor: Actor, task: { projectId: string; captures: string[] }) {
    this.archive.refreshLater(task.projectId, actor.userId);
    if (!task.captures.some((key) => SURVEY_FACTS.includes(key))) return;
    try {
      await this.budget.afterSurvey(actor, task.projectId);
    } catch (error) {
      this.log.error(`Budget check failed for ${task.projectId}: ${String(error)}`);
    }
  }

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
    await assertUnblocked(this.db, task);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    await closeOpenWait(this.db, task);
    await this.db
      .update(projectTasks)
      .set({
        status: 'in_progress',
        startedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(projectTasks.id, id));
    await settleWorkOrderForTask(this.db, id, actor.userId);
    // Only the first start counts; resuming after a wait does not message again.
    if (!task.startedAt)
      await Promise.all([tellCustomerAbout(this.db, task, 'started'), this.stale.afterStart(task)]);
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
          waitingSince: await nextWaitStart(tx, task, party),
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
      // Asking the team for help reaches the manager now, not after the escalation days.
      if (party === 'internal' && task.status !== 'waiting') await tellHelpAsked(tx, task, actor);
      // The customer hears about a new wait on someone outside OneOhm (PRD 5.2), once per wait.
      if (task.status !== 'waiting' || task.waitingParty !== party)
        await waitStarted(tx, task, party);
    });
    return this.present(id);
  }

  /** Needs every fact the task captures; approval tasks go to review instead of finishing. */
  async complete(
    actor: Actor,
    id: string,
    typedFacts: Record<string, string>,
    note: string | null | undefined,
    materialOverride?: string | null,
  ): Promise<ProjectTask> {
    const task = await this.load(actor, id);
    const facts = await checkedConsumerNumber(this.db, actor, task.projectId, typedFacts);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    await assertUnblocked(this.db, task);
    const handover = await checkHandoverMaterial(this.db, task, actor, materialOverride);
    const known = await this.db
      .select({ key: projectFacts.key })
      .from(projectFacts)
      .where(eq(projectFacts.projectId, task.projectId));
    const knownKeys = new Set(known.map((fact) => fact.key));
    // Measurements are facts too: one message names every empty field at once.
    const fields = [...new Set([...task.captures, ...measurementsFor(task)])];
    const missing = missingCaptures(fields, facts, knownKeys);
    if (missing.length > 0) {
      throw invalid(
        'Add the details this task records before completing it.',
        Object.fromEntries(missing.map((key) => [key, `${factLabel(key)} is required.`])),
      );
    }
    await assertEvidence(this.db, task, facts, knownKeys);
    const finished = await this.db.transaction(async (tx) => {
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
      if (handover) await recordHandoverOverride(tx, task, actor.userId, handover);
      await closeOpenWait(tx, task);
      // Approval work goes to its reviewer; the rest (or a lone approver's own) finishes.
      let done = true;
      if (task.approval) done = await sendForReview(tx, task, actor);
      else await finishTask(tx, task, actor.userId);
      await recordAudit(tx, actor.userId, 'task.completed', 'task', id, {
        facts: Object.keys(facts),
      });
      return done;
    });
    if (finished) await this.afterFinish(actor, task);
    return this.present(id);
  }

  async approve(actor: Actor, id: string): Promise<ProjectTask> {
    const [task] = await this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!task) throw notFound('That task');
    if (task.status !== 'in_review')
      throw conflict('This task is not waiting for approval.', 'not_in_review');
    const submittedBy = await assertMayReview(this.db, task, actor);
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({ approvedByUserId: actor.userId })
        .where(eq(projectTasks.id, id));
      await closeReview(tx, id, 'approved', actor.userId);
      await recordAudit(tx, actor.userId, 'task.approved', 'task', id, { submittedBy });
      await tellCustomerAbout(tx, task, 'approved');
      await finishTask(tx, task, actor.userId);
      await tellApproved(tx, task, actor.userId);
    });
    await this.afterFinish(actor, task);
    return this.present(id);
  }

  async assign(actor: Actor, id: string, userId: string | null): Promise<ProjectTask> {
    assertCan(actor, 'tasks.assign');
    const [task] = await this.db.select().from(projectTasks).where(eq(projectTasks.id, id));
    if (!task) throw notFound('That task');
    await this.db.transaction(async (tx) => {
      await lockVisitTarget(tx, { taskId: id });
      await tx
        .update(projectTasks)
        .set({ assigneeUserId: userId, updatedAt: new Date() })
        .where(eq(projectTasks.id, id));
      // A task given to a contractor's crew joins that contractor's work order.
      await syncWorkOrders(tx, task.projectId, actor.userId);
      await followAssignee(tx, { taskId: id }, userId, actor.userId);
      await recordAudit(tx, actor.userId, 'task.assigned', 'task', id, { userId });
      await tellAssignee(tx, task, userId, actor.userId);
    });
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

  private async present(id: string): Promise<ProjectTask> {
    const [task] = await presentTasks(this.db, eq(projectTasks.id, id));
    if (!task) throw notFound('That task');
    return task;
  }
}
