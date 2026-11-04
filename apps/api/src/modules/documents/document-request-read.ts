import type { CustomerDocumentRequest, DocumentRequest } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documentRequests,
  projects,
  properties,
  users,
} from '@oneohm/database';
import { type CustomerRequestableCategory, isCustomerRequestable } from '@oneohm/domain';
import { asc, desc, eq, type SQL, sql } from 'drizzle-orm';
import { describeHome } from '../customer-portal/customer-homes';

const category = (value: string): CustomerRequestableCategory =>
  isCustomerRequestable(value) ? value : 'other';

/** Requests matching `where`, open ones first, newest first. */
export async function readRequests(
  db: DatabaseExecutor,
  where: SQL | undefined,
): Promise<DocumentRequest[]> {
  const rows = await db
    .select({
      request: documentRequests,
      code: projects.code,
      home: {
        label: properties.label,
        city: properties.city,
        consumerNumber: properties.consumerNumber,
      },
      by: users.fullName,
    })
    .from(documentRequests)
    .leftJoin(projects, eq(projects.id, documentRequests.projectId))
    .leftJoin(properties, eq(properties.id, projects.propertyId))
    .leftJoin(users, eq(users.id, documentRequests.requestedByUserId))
    .where(where)
    .orderBy(
      asc(sql`case when ${documentRequests.status} = 'open' then 0 else 1 end`),
      desc(documentRequests.createdAt),
    );
  return rows.map(({ request, code, home, by }) => ({
    id: request.id,
    customerId: request.customerId,
    projectId: request.projectId,
    projectCode: code,
    homeName: home ? describeHome(home).title : null,
    category: category(request.category),
    title: request.title,
    note: request.note,
    status: request.status,
    documentId: request.documentId,
    requestedBy: by,
    createdAt: request.createdAt.toISOString(),
    receivedAt: request.receivedAt?.toISOString() ?? null,
  }));
}

/** The customer's view: no staff names or internal ids. */
export const forCustomer = (request: DocumentRequest): CustomerDocumentRequest => ({
  id: request.id,
  projectCode: request.projectCode,
  homeName: request.homeName,
  category: request.category,
  title: request.title,
  note: request.note,
  status: request.status,
  createdAt: request.createdAt,
  receivedAt: request.receivedAt,
});
