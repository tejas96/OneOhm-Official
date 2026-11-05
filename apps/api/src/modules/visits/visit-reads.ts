import {
  customers,
  type DatabaseExecutor,
  homeNameOf,
  leads,
  projects,
  projectTasks,
  serviceRequests,
  visits,
} from '@oneohm/database';
import { OPEN_VISIT_STATUSES, type VisitKind, visitKindOfTask } from '@oneohm/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { invalid, notFound } from '../../common/http/errors';

/** What a visit is about, resolved from a task, a lead or a service request. */
export interface VisitTarget {
  readonly kind: VisitKind;
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly projectId: string | null;
  readonly leadId: string | null;
  readonly serviceRequestId: string | null;
  readonly amcVisitId: string | null;
  readonly taskId: string | null;
  readonly propertyId: string | null;
  readonly home: string;
  /** Who comes (the task's person, the lead's owner, the service person). */
  readonly crew: readonly string[];
  /** Who is alerted about this visit: the crew, else the project manager or lead owner. */
  readonly owner: string | null;
  /** The visit may message the customer (PRD rule: a task's template must allow it). */
  readonly mayMessage: boolean;
  /** The alert goes to those who manage this capability when nobody is named. */
  readonly capability: 'projects.manage' | 'service.manage' | 'leads.manage';
  readonly title: string;
}

export interface VisitScope {
  readonly taskId?: string | undefined;
  readonly leadId?: string | undefined;
  readonly serviceRequestId?: string | undefined;
}

const person = (id: string | null) => (id ? [id] : []);

export async function targetOf(db: DatabaseExecutor, scope: VisitScope): Promise<VisitTarget> {
  if (scope.taskId) return taskTarget(db, scope.taskId);
  if (scope.serviceRequestId) return serviceTarget(db, scope.serviceRequestId);
  if (scope.leadId) return leadTarget(db, scope.leadId);
  throw invalid('Choose a task, a lead or a service request.');
}

async function taskTarget(db: DatabaseExecutor, taskId: string): Promise<VisitTarget> {
  const [row] = await db
    .select({
      task: projectTasks,
      customerId: projects.customerId,
      propertyId: projects.propertyId,
      manager: projects.managerUserId,
      name: customers.name,
      phone: customers.phoneE164,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .innerJoin(customers, eq(customers.id, projects.customerId))
    .where(eq(projectTasks.id, taskId))
    .limit(1);
  if (!row) throw notFound('That task');
  const kind = visitKindOfTask(row.task.templateKey);
  if (!kind) throw invalid('This task is not a visit to the customer.');
  return {
    kind,
    customerId: row.customerId,
    customerName: row.name,
    phone: row.phone,
    projectId: row.task.projectId,
    leadId: null,
    serviceRequestId: null,
    amcVisitId: null,
    taskId,
    propertyId: row.propertyId,
    home: await homeNameOf(db, row.task.projectId, row.propertyId),
    crew: person(row.task.assigneeUserId),
    owner: row.task.assigneeUserId ?? row.manager,
    mayMessage: row.task.notifyCustomer,
    capability: 'projects.manage',
    title: row.task.title,
  };
}

async function serviceTarget(db: DatabaseExecutor, id: string): Promise<VisitTarget> {
  const [row] = await db
    .select({
      request: serviceRequests,
      name: customers.name,
      phone: customers.phoneE164,
      propertyId: projects.propertyId,
      amc: sql<
        string | null
      >`(select a.id from amc_visits a where a.service_request_id = ${serviceRequests.id} limit 1)`,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .where(eq(serviceRequests.id, id))
    .limit(1);
  if (!row) throw notFound('That service request');
  const { request } = row;
  return {
    kind: row.amc ? 'amc' : 'service',
    customerId: request.customerId,
    customerName: row.name,
    phone: row.phone,
    projectId: request.projectId,
    leadId: null,
    serviceRequestId: id,
    amcVisitId: row.amc,
    taskId: null,
    propertyId: row.propertyId,
    home: await homeNameOf(db, request.projectId, row.propertyId),
    crew: person(request.assigneeUserId),
    owner: request.assigneeUserId,
    mayMessage: true,
    capability: 'service.manage',
    title: request.category,
  };
}

async function leadTarget(db: DatabaseExecutor, leadId: string): Promise<VisitTarget> {
  const [row] = await db
    .select({ lead: leads, name: customers.name, phone: customers.phoneE164 })
    .from(leads)
    .innerJoin(customers, eq(customers.id, leads.customerId))
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!row?.lead.customerId) throw invalid('Add the site to this lead before booking a visit.');
  return {
    kind: 'survey',
    customerId: row.lead.customerId,
    customerName: row.name,
    phone: row.phone,
    projectId: null,
    leadId,
    serviceRequestId: null,
    amcVisitId: null,
    taskId: null,
    propertyId: row.lead.propertyId,
    home: await homeNameOf(db, null, row.lead.propertyId),
    crew: person(row.lead.ownerUserId),
    owner: row.lead.ownerUserId,
    mayMessage: true,
    capability: 'leads.manage',
    title: 'Site survey',
  };
}

/** The open visit for this scope, if any. */
export async function openVisitFor(db: DatabaseExecutor, target: VisitTarget) {
  const where = target.taskId
    ? eq(visits.taskId, target.taskId)
    : target.serviceRequestId
      ? eq(visits.serviceRequestId, target.serviceRequestId)
      : and(eq(visits.leadId, target.leadId ?? ''), eq(visits.kind, target.kind));
  const [row] = await db
    .select()
    .from(visits)
    .where(and(where, inArray(visits.status, [...OPEN_VISIT_STATUSES])))
    .limit(1);
  return row ?? null;
}

/** The visit kind of a task, or null when the task is office work. */
export async function taskVisitKind(db: DatabaseExecutor, taskId: string) {
  const [task] = await db
    .select({ key: projectTasks.templateKey })
    .from(projectTasks)
    .where(eq(projectTasks.id, taskId));
  if (!task) throw notFound('That task');
  return visitKindOfTask(task.key);
}

/** The scope that finds the target of a visit, or of a visit ask. */
export const scopeOfRow = (row: {
  readonly taskId: string | null;
  readonly serviceRequestId: string | null;
  readonly leadId: string | null;
}): VisitScope => ({
  ...(row.taskId ? { taskId: row.taskId } : {}),
  ...(!row.taskId && row.serviceRequestId ? { serviceRequestId: row.serviceRequestId } : {}),
  ...(!row.taskId && !row.serviceRequestId && row.leadId ? { leadId: row.leadId } : {}),
});

/** A task's visit that has not been closed: proposed, confirmed, or missed and still to be marked done. */
export async function openVisitForTask(db: DatabaseExecutor, taskId: string) {
  const [row] = await db
    .select()
    .from(visits)
    .where(
      and(eq(visits.taskId, taskId), inArray(visits.status, ['proposed', 'confirmed', 'missed'])),
    )
    .limit(1);
  return row ?? null;
}
