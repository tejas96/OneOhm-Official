import {
  type Database,
  type Notice,
  notify,
  notifyHolders,
  projects,
  projectTasks,
  users,
} from '@oneohm/database';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, lt, ne, or } from 'drizzle-orm';

/** When late or stuck work is pushed to someone (PRD 3.7, 7.1). */
export const ESCALATION = {
  /** Days late before the project manager hears. */
  managerAfterDays: 2,
  /** Days late before everyone who manages projects hears. */
  ownersAfterDays: 7,
  /** Days a task may wait on the OneOhm team before the manager hears. */
  stuckInternalDays: 3,
  /** Days a task may wait on the customer, bank or DISCOM before the manager hears. */
  stuckOutsideDays: 14,
} as const;

interface LateTask {
  readonly id: string;
  readonly title: string;
  readonly projectId: string;
  readonly code: string;
  readonly managerUserId: string | null;
  readonly assignee: string | null;
}

const subject = (task: LateTask) =>
  ({ type: 'task', id: task.id, projectId: task.projectId }) as const;

/** The manager, or failing that everyone who can assign work. */
async function tellManager(db: Database, task: LateTask, notice: Notice): Promise<void> {
  if (task.managerUserId) await notify(db, { userId: task.managerUserId }, notice);
  else await notifyHolders(db, 'tasks.assign', notice);
}

async function lateTasks(db: Database, today: string) {
  return db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      projectId: projectTasks.projectId,
      dueDate: projectTasks.dueDate,
      status: projectTasks.status,
      waitingParty: projectTasks.waitingParty,
      waitingSince: projectTasks.waitingSince,
      code: projects.code,
      managerUserId: projects.managerUserId,
      assignee: users.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(
      and(
        ne(projectTasks.status, 'completed'),
        // Switched-on projects still have handover and subsidy tasks to chase.
        inArray(projects.status, ['active', 'operational']),
        or(
          lt(projectTasks.dueDate, addDays(today, -ESCALATION.managerAfterDays + 1)),
          isNotNull(projectTasks.waitingSince),
        ),
      ),
    );
}

/**
 * Each morning, late and stuck tasks are pushed up: to the project manager first, then
 * to everyone who manages projects. Each step alerts once, so nobody is spammed.
 */
export async function queueEscalations(db: Database, today: string): Promise<number> {
  let sent = 0;
  for (const row of await lateTasks(db, today)) {
    const task: LateTask = row;
    const late = Math.max(0, daysBetween(row.dueDate, today));
    const who = row.assignee ?? 'nobody yet';
    if (late >= ESCALATION.ownersAfterDays) {
      sent += await notifyHolders(db, 'projects.manage', {
        kind: 'task_escalated',
        title: `${late} days late on ${row.code}`,
        body: `${row.title} (with ${who}).`,
        subject: subject(task),
        dedupeKey: `escalate:${row.id}:owners`,
      });
    } else if (late >= ESCALATION.managerAfterDays) {
      await tellManager(db, task, {
        kind: 'task_late',
        title: `Late on ${row.code}`,
        body: `${row.title} is ${late} days late (with ${who}).`,
        subject: subject(task),
        dedupeKey: `escalate:${row.id}:manager`,
      });
      sent += 1;
    }
    if (!row.waitingSince || row.status !== 'waiting') continue;
    const since = row.waitingSince.toISOString().slice(0, 10);
    const waited = daysBetween(since, today);
    const internal = row.waitingParty === 'internal';
    const limit = internal ? ESCALATION.stuckInternalDays : ESCALATION.stuckOutsideDays;
    if (waited < limit) continue;
    await tellManager(db, task, {
      kind: 'task_stuck',
      title: `Stuck on ${row.code}`,
      body: `${row.title} has waited ${waited} days on ${internal ? 'the team' : row.waitingParty}.`,
      subject: subject(task),
      dedupeKey: `stuck:${row.id}:${since}`,
    });
    sent += 1;
  }
  return sent;
}
