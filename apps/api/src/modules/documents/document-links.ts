import type { UploadFields } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  projects,
  projectTasks,
  properties,
} from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { invalid, notFound } from '../../common/http/errors';

export interface ResolvedLinks {
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly customerId: string | null;
  readonly propertyId: string | null;
  readonly taskAssigneeId: string | null;
  readonly taskCompleted: boolean;
}

type Fields = Pick<UploadFields, 'projectId' | 'taskId' | 'customerId' | 'propertyId'>;

async function fromTask(db: DatabaseExecutor, taskId: string, projectId: string | null) {
  const [task] = await db
    .select({
      projectId: projectTasks.projectId,
      assignee: projectTasks.assigneeUserId,
      status: projectTasks.status,
    })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId))
    .limit(1);
  if (!task) throw notFound('That task');
  if (projectId && projectId !== task.projectId) {
    throw invalid('The task belongs to a different project.', { taskId: 'Wrong project.' });
  }
  return task;
}

async function fromProject(db: DatabaseExecutor, projectId: string, customerId: string | null) {
  const [project] = await db
    .select({ customerId: projects.customerId, propertyId: projects.propertyId })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw notFound('That project');
  if (customerId && customerId !== project.customerId) {
    throw invalid('The project belongs to a different customer.', {
      customerId: 'Wrong customer.',
    });
  }
  return project;
}

async function assertCustomer(db: DatabaseExecutor, customerId: string): Promise<void> {
  const [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) throw notFound('That customer');
}

async function ownerOfProperty(
  db: DatabaseExecutor,
  propertyId: string,
  customerId: string | null,
): Promise<string> {
  const [property] = await db
    .select({ customerId: properties.customerId })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  if (!property) throw notFound('That site');
  if (customerId && property.customerId !== customerId) {
    throw invalid('The site belongs to a different customer.', { propertyId: 'Wrong site.' });
  }
  return property.customerId;
}

/**
 * Auto-links a file (PRD 3.14): a task gives its project, a project gives its customer
 * and property. Links that contradict each other are refused.
 */
export async function resolveLinks(db: DatabaseExecutor, fields: Fields): Promise<ResolvedLinks> {
  const task = fields.taskId ? await fromTask(db, fields.taskId, fields.projectId ?? null) : null;
  const projectId = task?.projectId ?? fields.projectId ?? null;
  let customerId = fields.customerId ?? null;
  let propertyId = fields.propertyId ?? null;

  if (projectId) {
    const project = await fromProject(db, projectId, customerId);
    customerId = project.customerId;
    propertyId ??= project.propertyId;
  } else if (customerId) {
    await assertCustomer(db, customerId);
  }
  if (propertyId) customerId = await ownerOfProperty(db, propertyId, customerId);

  return {
    projectId,
    taskId: fields.taskId ?? null,
    customerId,
    propertyId,
    taskAssigneeId: task?.assignee ?? null,
    taskCompleted: task?.status === 'completed',
  };
}

/** Folder for the file in storage: by project when there is one, else by customer. */
export function storageScope(links: Pick<ResolvedLinks, 'projectId' | 'customerId'>): string {
  if (links.projectId) return `projects/${links.projectId}`;
  return `customers/${links.customerId ?? 'unlinked'}`;
}
