import {
  type Database,
  escalationPolicy,
  liveManagerId,
  managerUser,
  type Notice,
  notify,
  notifyHolders,
  projects,
  projectTasks,
  taskTemplates,
  users,
} from '@oneohm/database';
import {
  DEFAULT_ESCALATION,
  type EscalationPolicy,
  earliestEscalationDays,
  lateEscalation,
} from '@oneohm/domain';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, eq, inArray, isNotNull, lt, ne, or } from 'drizzle-orm';
import { escalationKey } from './escalation-keys';
import { lateDays, leaveByPerson } from './late-days';
import { queueBlockerOnLeave } from './stale-reminders';

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

/** The days set in Settings → Task templates, or the shipped ones (PRD 3.7, 7.2). */
async function loadPolicy(db: Database): Promise<EscalationPolicy> {
  const [row] = await db.select().from(escalationPolicy).where(eq(escalationPolicy.id, 'default'));
  return row ?? DEFAULT_ESCALATION;
}

/** The active manager, or failing that everyone who can assign work (an inactive one counts as none). */
async function tellManager(db: Database, task: LateTask, notice: Notice): Promise<void> {
  if (task.managerUserId) await notify(db, { userId: task.managerUserId }, notice);
  else await notifyHolders(db, 'tasks.assign', notice);
}

async function lateTasks(db: Database, today: string, earliest: number) {
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
      managerUserId: liveManagerId,
      assignee: users.fullName,
      assigneeUserId: projectTasks.assigneeUserId,
      templateDays: taskTemplates.escalateAfterDays,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(managerUser, eq(managerUser.id, projects.managerUserId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .leftJoin(taskTemplates, eq(taskTemplates.key, projectTasks.templateKey))
    .where(
      and(
        ne(projectTasks.status, 'completed'),
        // Switched-on projects still have handover and subsidy tasks to chase.
        inArray(projects.status, ['active', 'operational']),
        or(
          lt(projectTasks.dueDate, addDays(today, -earliest + 1)),
          isNotNull(projectTasks.waitingSince),
        ),
      ),
    );
}

/**
 * Each morning, late and stuck tasks are pushed up: to the project manager first, then
 * to everyone who manages projects, after the days set in Settings (a task template
 * may set its own). Each step alerts once, so nobody is spammed.
 */
export async function queueEscalations(db: Database, today: string): Promise<number> {
  const policy = await loadPolicy(db);
  const overrides = await db
    .selectDistinct({ days: taskTemplates.escalateAfterDays })
    .from(taskTemplates)
    .where(isNotNull(taskTemplates.escalateAfterDays));
  const earliest = earliestEscalationDays(
    policy,
    overrides.map((row) => row.days),
  );
  let sent = 0;
  const rows = await lateTasks(db, today, earliest);
  const leave = await leaveByPerson(
    db,
    [...new Set(rows.map((row) => row.assigneeUserId).filter((id) => id !== null))],
    today,
  );
  for (const row of rows) {
    const task: LateTask = row;
    // Days on approved leave never count toward late (spec 3.5).
    const late = lateDays(
      row.dueDate,
      today,
      row.assigneeUserId ? (leave.get(row.assigneeUserId) ?? []) : [],
    );
    const who = row.assignee ?? 'nobody yet';
    const step = lateEscalation(late, policy, row.templateDays);
    if (step === 'owners') {
      sent += await notifyHolders(db, 'projects.manage', {
        kind: 'task_escalated',
        title: `${late} days late on ${row.code}`,
        body: `${row.title} (with ${who}).`,
        subject: subject(task),
        dedupeKey: `escalate:${row.id}:owners`,
      });
    } else if (step === 'manager') {
      await tellManager(db, task, {
        kind: 'task_late',
        title: `Late on ${row.code}`,
        body: `${row.title} is ${late} days late (with ${who}).`,
        subject: subject(task),
        dedupeKey: escalationKey({
          kind: 'late',
          taskId: row.id,
          managerUserId: task.managerUserId,
        }),
      });
      sent += 1;
    }
    if (!row.waitingSince || row.status !== 'waiting') continue;
    const since = row.waitingSince.toISOString().slice(0, 10);
    const waited = daysBetween(since, today);
    const internal = row.waitingParty === 'internal';
    const limit = internal ? policy.stuckInternalDays : policy.stuckOutsideDays;
    if (waited < limit) continue;
    await tellManager(db, task, {
      kind: 'task_stuck',
      title: `Stuck on ${row.code}`,
      body: `${row.title} has waited ${waited} days on ${internal ? 'the team' : row.waitingParty}.`,
      subject: subject(task),
      dedupeKey: escalationKey({
        kind: 'stuck',
        taskId: row.id,
        since,
        managerUserId: task.managerUserId,
      }),
    });
    sent += 1;
  }
  // Same morning run (spec 3.5: extend this job, never a second reminder system). Stale
  // work is not sent one task at a time: it goes into the morning summary.
  sent += await queueBlockerOnLeave(db, today, tellManager);
  return sent;
}
