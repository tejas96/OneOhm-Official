import type { SendScope } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  leads,
  projects,
  projectTasks,
  serviceRequests,
  waConversations,
} from '@oneohm/database';
import {
  chatWindowOpen,
  rightsFor,
  type SendAction,
  type SendPlace,
  sendActionsFor,
} from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { leadVisibility } from '../crm/lead-read';
import { languageOfPhone } from '../documents/document-request-messages';
import type { AssistantLanguage } from '../whatsapp/assistant/language';

/** Where the button was pressed, resolved: the customer, the project or lead, and the chat. */
export interface SendContext {
  readonly customerId: string;
  readonly customerName: string;
  readonly phone: string;
  readonly language: AssistantLanguage;
  readonly projectId: string | null;
  readonly projectCode: string | null;
  readonly leadId: string | null;
  readonly taskId: string | null;
  readonly serviceRequestId: string | null;
  readonly place: SendPlace;
  /** The customer's chat is open (24 hours) and has not said STOP. */
  readonly chatOpen: boolean;
}

/** A lead with no site yet has no customer: nothing can be sent. */
export interface NoCustomer {
  readonly none: true;
  readonly reason: string;
}

export async function chatOpenFor(db: DatabaseExecutor, phone: string): Promise<boolean> {
  const [chat] = await db
    .select({ at: waConversations.lastInboundAt, out: waConversations.optedOutAt })
    .from(waConversations)
    .where(eq(waConversations.phone, phone))
    .limit(1);
  return Boolean(chat && !chat.out && chatWindowOpen(chat.at));
}

async function customerOf(db: DatabaseExecutor, customerId: string) {
  const [row] = await db
    .select({ id: customers.id, name: customers.name, phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!row) throw notFound('That customer');
  return row;
}

/**
 * The scope behind a press of the button: a task brings its project, a project its customer,
 * a lead its site's customer. A lead the person cannot see is "not found".
 */
export async function resolveScope(
  db: DatabaseExecutor,
  actor: Actor,
  scope: SendScope,
): Promise<SendContext | NoCustomer> {
  let projectId = scope.projectId ?? null;
  const taskId = scope.taskId ?? null;
  if (taskId) {
    const [task] = await db
      .select({ projectId: projectTasks.projectId })
      .from(projectTasks)
      .where(eq(projectTasks.id, taskId))
      .limit(1);
    if (!task) throw notFound('That task');
    projectId = task.projectId;
  }
  let customerId = scope.customerId ?? null;
  let projectCode: string | null = null;
  let leadId: string | null = null;
  if (projectId) {
    const [project] = await db
      .select({ customerId: projects.customerId, code: projects.code })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    customerId = project.customerId;
    projectCode = project.code;
  } else if (scope.serviceRequestId) {
    const request = await serviceRequestOf(db, scope.serviceRequestId);
    customerId = request.customerId;
    projectId = request.projectId;
  } else if (scope.leadId) {
    const [lead] = await db
      .select({ id: leads.id, customerId: leads.customerId })
      .from(leads)
      .where(and(eq(leads.id, scope.leadId), leadVisibility(actor)))
      .limit(1);
    if (!lead) throw notFound('That lead');
    leadId = lead.id;
    customerId = lead.customerId;
    if (!customerId) {
      return { none: true, reason: 'Add the site to this lead to send things to the customer.' };
    }
  }
  if (!customerId) throw invalid('Choose a customer, a project, a lead or a task.');
  return contextFor(db, {
    customerId,
    projectId,
    projectCode,
    leadId,
    taskId,
    serviceRequestId: scope.serviceRequestId ?? null,
  });
}

/** The context for ids already known (the scope above, or the system acting on a task). */
export async function contextFor(
  db: DatabaseExecutor,
  ids: Pick<
    SendContext,
    'customerId' | 'projectId' | 'projectCode' | 'leadId' | 'taskId' | 'serviceRequestId'
  >,
): Promise<SendContext> {
  const customer = await customerOf(db, ids.customerId);
  return {
    ...ids,
    customerName: customer.name,
    phone: customer.phone,
    language: await languageOfPhone(db, customer.phone),
    place: {
      customer: true,
      project: ids.projectId !== null && ids.taskId === null && !ids.serviceRequestId,
      lead: ids.leadId !== null,
      task: ids.taskId !== null,
      service: Boolean(ids.serviceRequestId),
    },
    chatOpen: await chatOpenFor(db, customer.phone),
  };
}

export const isNone = (value: SendContext | NoCustomer): value is NoCustomer => 'none' in value;

/** The actions this place offers that this person may send. */
export function allowedActions(actor: Actor, place: SendPlace): SendAction[] {
  return sendActionsFor(place).filter((action) =>
    rightsFor(action).some((right) => can(actor, right as Parameters<typeof can>[1])),
  );
}

/** Throws unless the person may send this action from this place. */
export function assertAllowed(actor: Actor, place: SendPlace, action: SendAction): void {
  if (!allowedActions(actor, place).includes(action)) throw forbidden();
}

async function serviceRequestOf(db: DatabaseExecutor, id: string) {
  const [request] = await db
    .select({ customerId: serviceRequests.customerId, projectId: serviceRequests.projectId })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, id))
    .limit(1);
  if (!request) throw notFound('That service request');
  return request;
}
