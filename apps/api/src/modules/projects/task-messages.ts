import {
  customers,
  type DatabaseExecutor,
  notify,
  projects,
  type projectTasks,
  taskTemplates,
} from '@oneohm/database';
import type { TaskNotifyEvent } from '@oneohm/domain';
import { formatKwp } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { queueWhatsApp } from '../../common/outbox';

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
  const [project] = await db
    .select({
      code: projects.code,
      capacityWp: projects.capacityWp,
      phone: customers.phoneE164,
      name: customers.name,
      optIn: customers.whatsappOptIn,
    })
    .from(projects)
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projects.id, task.projectId))
    .limit(1);
  if (!project?.optIn) return;
  await queueWhatsApp(
    db,
    project.phone,
    template?.messageKey ?? 'project_milestone',
    {
      customer: project.name,
      project: project.code,
      milestone: template?.customerTitle ?? task.title,
      capacity: formatKwp(project.capacityWp),
    },
    `task_${event}:${task.id}`,
  );
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
