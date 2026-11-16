import {
  customers,
  type DatabaseExecutor,
  homeNameOf,
  projects,
  projectTasks,
  properties,
  serviceRequests,
  users,
} from '@oneohm/database';
import type { GeoPoint } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { SendContext } from '../send-to-customer/send-context';
import { visitContext } from '../visits/visit-tell';
import { loadPolicy } from '../workforce/policy';

/** One piece of work at a customer's site: a task, or a service request. */
export interface Job {
  readonly taskId: string | null;
  readonly serviceRequestId: string | null;
}

/** The customer a site visit's news goes to, and what the messages say about the place. */
export interface NewsTarget {
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly language: string | null;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly serviceRequestId: string | null;
  /** The home as the customer's messages name it ("Sangli"). */
  readonly home: string;
  /** The home's saved pin, when it has one. */
  readonly site: GeoPoint | null;
  /** A task messages its customer only when its template says so (PRD 6.2); a request always. */
  readonly mayMessage: boolean;
  /** The job's name for staff: the task's title or the request's category. */
  readonly label: string;
}

const pinOf = (row: { latitude: number | null; longitude: number | null }): GeoPoint | null =>
  row.latitude !== null && row.longitude !== null
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;

/** The customer of a task or a service request; null when the work is gone. */
export async function jobTarget(db: DatabaseExecutor, job: Job): Promise<NewsTarget | null> {
  const base = {
    customerId: customers.id,
    customerName: customers.name,
    phone: customers.phoneE164,
    language: customers.preferredLanguage,
    propertyId: projects.propertyId,
    latitude: properties.latitude,
    longitude: properties.longitude,
  };
  if (job.taskId) {
    const [row] = await db
      .select({ ...base, task: projectTasks })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .leftJoin(properties, eq(properties.id, projects.propertyId))
      .where(eq(projectTasks.id, job.taskId))
      .limit(1);
    if (!row) return null;
    return {
      ...row,
      projectId: row.task.projectId,
      taskId: row.task.id,
      serviceRequestId: null,
      home: await homeNameOf(db, row.task.projectId, row.propertyId),
      site: pinOf(row),
      mayMessage: row.task.notifyCustomer,
      label: row.task.title,
    };
  }
  if (!job.serviceRequestId) return null;
  const [row] = await db
    .select({ ...base, request: serviceRequests })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .where(eq(serviceRequests.id, job.serviceRequestId))
    .limit(1);
  if (!row) return null;
  return {
    ...row,
    projectId: row.request.projectId,
    taskId: null,
    serviceRequestId: row.request.id,
    home: await homeNameOf(db, row.request.projectId, row.propertyId),
    site: pinOf(row),
    mayMessage: true,
    label: row.request.category,
  };
}

/**
 * The target when its customer may hear about this visit now: the policy switch
 * `customerVisitMessages` is on and the task messages its customer. Null otherwise (STOP and
 * the customer's channel are kept by the routing itself).
 */
export async function newsTargetFor(db: DatabaseExecutor, job: Job): Promise<NewsTarget | null> {
  const policy = await loadPolicy(db);
  if (!policy.travel.customerVisitMessages) return null;
  const target = await jobTarget(db, job);
  return target?.mayMessage ? target : null;
}

/** Where the message goes: the customer's language and whether their chat is open. */
export const newsContext = (db: DatabaseExecutor, target: NewsTarget): Promise<SendContext> =>
  visitContext(db, { ...target, leadId: null });

/** The worker's first name, as the customer reads it ("Ravi"). */
export async function workerFirstName(db: DatabaseExecutor, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: users.fullName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const name = titleCaseName(row?.name ?? '').split(' ')[0];
  return name || 'Our team';
}
