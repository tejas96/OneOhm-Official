import type { CustomerDocumentRequest, DocumentRequest } from '@oneohm/api-contracts';
import {
  customerActions,
  type DatabaseExecutor,
  documents,
  projects,
  properties,
  users,
} from '@oneohm/database';
import { type CustomerRequestableCategory, isCustomerRequestable } from '@oneohm/domain';
import { and, asc, desc, eq, type SQL, sql } from 'drizzle-orm';
import { describeHome } from '../customer-portal/customer-homes';

const category = (value: string | null): CustomerRequestableCategory =>
  value && isCustomerRequestable(value) ? value : 'other';

/**
 * Reminders sent to the customer for the current ask (after an "ask again" the count starts
 * over), counted by the keys the worker gives them.
 */
const reasksOf = sql`(select count(*)::int from audit_log a where a.entity in ('customer_action', 'document_request') and a.action in ('customer_action.reasked', 'document_request.reasked') and a.entity_id = ${customerActions.id}::text)`;
const remindersOf = sql<number>`(select count(*)::int from outbox o where o.dedupe_key = 'paper_reminder:' || ${customerActions.id}::text || ':' || ${reasksOf}::text)`;

/** Paper requests matching `where`, open ones first, newest first. */
export async function readRequests(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<DocumentRequest[]> {
  const rows = await db
    .select({
      request: customerActions,
      code: projects.code,
      home: {
        label: properties.label,
        city: properties.city,
        consumerNumber: properties.consumerNumber,
      },
      by: users.fullName,
      checkedAt: documents.checkedAt,
      uploadedBy: documents.uploadedByUserId,
      reminders: remindersOf,
    })
    .from(customerActions)
    .leftJoin(projects, eq(projects.id, customerActions.projectId))
    .leftJoin(
      properties,
      eq(properties.id, sql`coalesce(${projects.propertyId}, ${customerActions.propertyId})`),
    )
    .leftJoin(users, eq(users.id, customerActions.requestedByUserId))
    .leftJoin(documents, eq(documents.id, customerActions.documentId))
    .where(and(eq(customerActions.type, 'paper'), where))
    .orderBy(
      asc(sql`case when ${customerActions.status} = 'open' then 0 else 1 end`),
      desc(customerActions.createdAt),
    );
  return rows.map(({ request, code, home, by, checkedAt, uploadedBy, reminders }) => ({
    id: request.id,
    type: request.type,
    customerId: request.customerId,
    leadId: request.leadId,
    projectId: request.projectId,
    projectCode: code,
    homeName: home ? describeHome(home).title : null,
    category: category(request.category),
    title: request.title,
    note: request.note,
    requirementKey: request.requirementKey,
    reason: request.reason,
    status: request.status,
    documentId: request.documentId,
    documentChecked: request.documentId ? checkedAt !== null : null,
    documentByTeam: request.documentId ? uploadedBy !== null : null,
    requestedBy: by,
    remindersSent: reminders,
    createdAt: request.createdAt.toISOString(),
    receivedAt: request.doneAt?.toISOString() ?? null,
    closedAt: request.closedAt?.toISOString() ?? null,
  }));
}

/**
 * The customer's view: no staff names or internal ids. A checked paper still reads as sent;
 * the latest "ask again" reason replaces the first note while it is open.
 */
export const forCustomer = (request: DocumentRequest): CustomerDocumentRequest => ({
  id: request.id,
  projectCode: request.projectCode,
  homeName: request.homeName,
  category: request.category,
  title: request.title,
  note: request.status === 'open' ? request.reason || request.note : request.note,
  status: request.status === 'closed' ? 'received' : request.status,
  createdAt: request.createdAt,
  receivedAt: request.receivedAt,
});
