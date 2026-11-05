import {
  customers,
  type DatabaseExecutor,
  notify,
  projects,
  type projectTasks,
  taskTemplates,
} from '@oneohm/database';
import {
  isOutsideParty,
  type TaskNotifyEvent,
  WAITING_REASON_WORDS,
  type WaitingParty,
} from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { daySpan } from '../../common/notices';
import { queueWhatsApp } from '../../common/outbox';
import { tellStepWithButtons, tellWaitingWithButtons } from '../journey/auto-messages';
import { attachmentLink, messagePhones } from './task-message-reach';

type TaskRow = Pick<
  typeof projectTasks.$inferSelect,
  'id' | 'title' | 'projectId' | 'templateKey' | 'notifyCustomer'
>;

async function templateOf(db: DatabaseExecutor, key: string) {
  const [row] = await db
    .select({
      notifyEvent: taskTemplates.notifyEvent,
      messageKey: taskTemplates.messageKey,
      customerTitle: taskTemplates.customerTitle,
      notifyManager: taskTemplates.notifyManager,
      recipients: taskTemplates.recipients,
      attachment: taskTemplates.attachment,
    })
    .from(taskTemplates)
    .where(eq(taskTemplates.key, key))
    .limit(1);
  return row;
}

/**
 * Tells the customer about a task when its template says so, at the event it names
 * (PRD 6.2). Internal tasks never message customers; only configured ones do.
 */
export async function tellCustomerAbout(
  db: DatabaseExecutor,
  task: TaskRow,
  event: TaskNotifyEvent,
): Promise<void> {
  if (!task.notifyCustomer) return;
  const template = await templateOf(db, task.templateKey);
  if ((template?.notifyEvent ?? 'completed') !== event) return;
  const project = await projectOf(db, task.projectId);
  // No WhatsApp opt-in check here: the message router sends SMS (or a printed paper)
  // to customers who said no to WhatsApp, so they still hear about their project.
  if (!project) return;
  const link = await attachmentLink(db, template?.attachment, project);
  // A message that carries a link falls back to the plain update when the paper is not there yet.
  const messageKey = template?.attachment && !link ? 'project_milestone' : template?.messageKey;
  const people = await messagePhones(db, project.customer, template?.recipients);
  for (const [index, person] of people.entries()) {
    const payload = {
      customer: person.name,
      project: project.code,
      milestone: template?.customerTitle?.trim() || task.title,
      capacity: formatKwp(project.capacityWp),
      ...(link ? { link } : {}),
      // The step's key, so the in-app alert can name it in the customer's language.
      step: task.templateKey,
    };
    const key =
      index === 0 ? `task_${event}:${task.id}` : `task_${event}:${task.id}:${person.phone}`;
    const message = messageKey ?? 'project_milestone';
    // Installation started and switch-on carry buttons inside the chat window (redesign §19).
    const about = { id: project.id, customerId: project.customerId };
    if (await tellStepWithButtons(db, message, about, person, payload, key)) continue;
    await queueWhatsApp(db, person.phone, message, payload, key);
  }
}

async function projectOf(db: DatabaseExecutor, projectId: string) {
  const [row] = await db
    .select({
      id: projects.id,
      code: projects.code,
      capacityWp: projects.capacityWp,
      customerId: customers.id,
      phone: customers.phoneE164,
      name: customers.name,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.id, projectId))
    .limit(1);
  return row
    ? { ...row, customer: { id: row.customerId, phone: row.phone, name: row.name } }
    : null;
}

/**
 * A customer-visible step now waits on someone outside OneOhm (PRD 5.2 "delay notification
 * with the reason"): the customer hears why, once per wait, by the usual route.
 */
export async function tellCustomerWaiting(
  db: DatabaseExecutor,
  task: Pick<typeof projectTasks.$inferSelect, 'id' | 'title' | 'projectId' | 'templateKey'> & {
    readonly customerVisible: boolean;
  },
  party: WaitingParty,
): Promise<void> {
  if (!task.customerVisible || !isOutsideParty(party)) return;
  const project = await projectOf(db, task.projectId);
  if (!project) return;
  const template = await templateOf(db, task.templateKey);
  // One message per wait: the minute it started keeps a double tap from sending twice.
  const now = new Date();
  await tellWaitingWithButtons(db, {
    taskId: task.id,
    party,
    project: { id: project.id, customerId: project.customerId },
    phone: project.phone,
    payload: {
      customer: project.name,
      project: project.code,
      milestone: template?.customerTitle?.trim() || task.title,
      reason: WAITING_REASON_WORDS[party],
      party,
      step: task.templateKey,
    },
    key: `task_waiting:${task.id}:${party}:${now.toISOString().slice(0, 16)}`,
    since: now,
  });
}

/** The project manager hears when a task flagged for them is done (PRD 3.7). */
export async function tellManagerDone(
  db: DatabaseExecutor,
  task: TaskRow,
  actorId: string,
): Promise<void> {
  const template = await templateOf(db, task.templateKey);
  if (!template?.notifyManager) return;
  const [project] = await db
    .select({ code: projects.code, managerUserId: projects.managerUserId })
    .from(projects)
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project?.managerUserId || project.managerUserId === actorId) return;
  await notify(
    db,
    { userId: project.managerUserId },
    {
      kind: 'task_done',
      title: `Done on ${project.code}`,
      body: task.title,
      subject: { type: 'task', id: task.id, projectId: task.projectId },
      dedupeKey: `task_done:${task.id}`,
    },
  );
}

/**
 * The customer hears the day of their site survey whenever it is set or changed (PRD 3.4),
 * through the usual route: WhatsApp, else SMS, else told in person.
 */
export async function tellSurveyDate(
  db: DatabaseExecutor,
  task: Pick<TaskRow, 'id' | 'projectId'>,
  date: string,
): Promise<void> {
  const [project] = await db
    .select({ code: projects.code, phone: customers.phoneE164, name: customers.name })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project) return;
  await queueWhatsApp(
    db,
    project.phone,
    'survey_scheduled',
    { customer: project.name, project: project.code, date: daySpan(date, date) },
    // A date can come back after another change, so each change messages once.
    `survey_date:${task.id}:${date}:${Date.now()}`,
  );
}
