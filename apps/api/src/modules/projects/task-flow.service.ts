import { Inject, Injectable } from '@nestjs/common';
import type { ProjectTask, RescheduleTaskInput, TaskActivity } from '@oneohm/api-contracts';
import { projectActivities, projectTasks } from '@oneohm/database';
import { siteVisitKindOf, type TaskPriority } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, assertCan, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { daySpan } from '../../common/notices';
import { presentTasks } from '../../common/read-models/project-tasks';
import { DATABASE, type Database } from '../../config/core.module';
import { openVisitForTask } from '../visits/visit-reads';
import { canViewTask } from './task-access';
import { taskTimeline } from './task-activity';
import { saveTick } from './task-checklist';
import { tellSurveyDate } from './task-messages';
import { tellRescheduled, tellReturned } from './task-notices';
import { setPriority } from './task-priority';
import { assertMayReview, closeReview } from './task-review';
import { followLine, moveLaterTasks } from './task-schedule';

const day = (date: string) => daySpan(date, date);
/** The reason as a sentence: capitalised, ending in a full stop. */
const sentence = (text: string) => {
  const trimmed = text.trim();
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
};

/**
 * Between start and finish (PRD 3.6, 4.4): managers move due dates, reviewers send work
 * back with a reason, and anyone working the task posts progress to the project history.
 */
@Injectable()
export class TaskFlowService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** A manager sets the task's priority; done work keeps the one it had. */
  async setPriority(actor: Actor, id: string, priority: TaskPriority): Promise<ProjectTask> {
    assertCan(actor, 'tasks.assign');
    const task = await this.row(id);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    await this.db.transaction((tx) => setPriority(tx, actor.userId, task, priority));
    return this.present(id);
  }

  /** A new due date with a reason; tasks waiting on it move later when they must. */
  async reschedule(actor: Actor, id: string, input: RescheduleTaskInput): Promise<ProjectTask> {
    assertCan(actor, 'projects.manage', 'tasks.assign');
    const task = await this.row(id);
    if (task.status === 'completed') throw conflict('This task is already done.', 'done');
    if (input.dueDate === task.dueDate) {
      throw invalid('Pick a different date.', { dueDate: 'This is already the due date.' });
    }
    if (input.dueDate < todayIn()) {
      throw invalid('Pick today or a later date.', { dueDate: 'Pick today or a later date.' });
    }
    // A visit booked after the new due date must be moved first, in the visit card.
    const visit = await openVisitForTask(this.db, id);
    if (visit && visit.status !== 'missed' && visit.day > input.dueDate)
      throw conflict(
        `A visit is booked on ${visit.day}; change it in the visit card first.`,
        'visit_booked',
      );
    const survey = siteVisitKindOf(task) === 'survey';
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({
          dueDate: input.dueDate,
          startDate: task.startDate > input.dueDate ? input.dueDate : task.startDate,
          updatedAt: new Date(),
        })
        .where(eq(projectTasks.id, id));
      const later = input.dueDate > task.dueDate;
      const { moved, days } = later
        ? await moveLaterTasks(tx, task, input.dueDate)
        : { moved: 0, days: 0 };
      await tx.insert(projectActivities).values({
        projectId: task.projectId,
        taskId: id,
        kind: 'rescheduled',
        message: `${task.title}: due date moved from ${day(task.dueDate)} to ${day(input.dueDate)}. ${sentence(input.reason)}${followLine(moved, days)}`,
        userId: actor.userId,
        data: { from: task.dueDate, to: input.dueDate, moved },
      });
      await recordAudit(tx, actor.userId, 'task.rescheduled', 'task', id, {
        from: task.dueDate,
        to: input.dueDate,
        reason: input.reason,
        moved,
      });
      await tellRescheduled(tx, task, input.dueDate, actor.userId);
      if (survey) await tellSurveyDate(tx, task, input.dueDate);
    });
    return this.present(id);
  }

  /** The reviewer sends work back to the assignee with what to correct. */
  async sendBack(actor: Actor, id: string, reason: string): Promise<ProjectTask> {
    const task = await this.row(id);
    if (task.status !== 'in_review')
      throw conflict('This task is not waiting for approval.', 'not_in_review');
    const submittedBy = await assertMayReview(this.db, task, actor);
    await this.db.transaction(async (tx) => {
      await tx
        .update(projectTasks)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(projectTasks.id, id));
      await closeReview(tx, id, 'returned', actor.userId, reason);
      await tx.insert(projectActivities).values({
        projectId: task.projectId,
        taskId: id,
        kind: 'returned',
        message: `${task.title} sent back for correction: ${reason}`,
        userId: actor.userId,
      });
      await recordAudit(tx, actor.userId, 'task.returned', 'task', id, { reason });
      await tellReturned(tx, task, task.assigneeUserId ?? submittedBy, actor, reason);
    });
    return this.present(id);
  }

  /** A progress note on the project history (PRD 4.4); the status stays as it is. */
  async postUpdate(actor: Actor, id: string, note: string): Promise<ProjectTask> {
    const task = await this.row(id);
    // Crews cannot see other people's tasks, so those are "not found", not "not allowed".
    if (actor.kind === 'partner' && !canViewTask(actor, task)) throw notFound('That task');
    const mine = task.assigneeUserId === actor.userId;
    if (!mine && !can(actor, 'tasks.assign') && !can(actor, 'projects.manage'))
      throw forbidden('Only the assignee or a manager can post on this task.');
    await this.db.insert(projectActivities).values({
      projectId: task.projectId,
      taskId: id,
      kind: 'update',
      message: `${task.title}: ${note}`,
      userId: actor.userId,
    });
    return this.present(id);
  }

  /** One checklist tick, saved at once by whoever works the task. */
  async tick(actor: Actor, id: string, key: string, done: boolean): Promise<ProjectTask> {
    const task = await this.row(id);
    if (actor.kind === 'partner' && !canViewTask(actor, task)) throw notFound('That task');
    const mine = task.assigneeUserId === actor.userId;
    if (!mine && !can(actor, 'tasks.assign') && !can(actor, 'projects.manage'))
      throw forbidden('Only the assignee or a manager can tick this checklist.');
    await this.db.transaction((tx) => saveTick(tx, task, key, done));
    return this.present(id);
  }

  /** The latest project history for the task screen. */
  async activity(actor: Actor, id: string): Promise<TaskActivity[]> {
    const task = await this.row(id);
    if (!canViewTask(actor, task)) throw notFound('That task');
    return taskTimeline(this.db, actor, task);
  }

  private async row(id: string) {
    const [task] = await this.db
      .select()
      .from(projectTasks)
      .where(eq(projectTasks.id, id))
      .limit(1);
    if (!task) throw notFound('That task');
    return task;
  }

  private async present(id: string): Promise<ProjectTask> {
    const [task] = await presentTasks(this.db, eq(projectTasks.id, id));
    if (!task) throw notFound('That task');
    return task;
  }
}
