import type {
  CustomerFeedback,
  CustomerReferral,
  CustomerServiceRequest,
} from '@oneohm/api-contracts';
import {
  customerFeedback,
  type Database,
  leads,
  projects,
  serviceCategories,
  serviceRequests,
  users,
} from '@oneohm/database';
import { desc, eq } from 'drizzle-orm';

const SERVICE_STATUSES = new Set<string>(['open', 'in_progress', 'resolved']);

/** Service requests, newest first, with who is on them and how they ended. */
export async function customerServiceRequests(
  db: Database,
  customerId: string,
): Promise<CustomerServiceRequest[]> {
  const rows = await db
    .select({
      request: serviceRequests,
      projectCode: projects.code,
      assignee: users.fullName,
      categoryLabel: serviceCategories.label,
    })
    .from(serviceRequests)
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(users, eq(users.id, serviceRequests.assigneeUserId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .where(eq(serviceRequests.customerId, customerId))
    .orderBy(desc(serviceRequests.createdAt));
  return rows.map(({ request, projectCode, assignee, categoryLabel }) => ({
    id: request.id,
    category: request.category,
    categoryLabel: categoryLabel ?? request.category,
    description: request.description,
    status: (SERVICE_STATUSES.has(request.status)
      ? request.status
      : 'open') as CustomerServiceRequest['status'],
    project: request.projectId && projectCode ? { id: request.projectId, code: projectCode } : null,
    assigneeName: assignee,
    resolutionNote: request.resolutionNote,
    createdAt: request.createdAt.toISOString(),
    resolvedAt: request.resolvedAt?.toISOString() ?? null,
  }));
}

/** Ratings and comments after handover, newest first. */
export async function customerFeedbackList(
  db: Database,
  customerId: string,
): Promise<CustomerFeedback[]> {
  const rows = await db
    .select({ feedback: customerFeedback, projectCode: projects.code })
    .from(customerFeedback)
    .innerJoin(projects, eq(projects.id, customerFeedback.projectId))
    .where(eq(customerFeedback.customerId, customerId))
    .orderBy(desc(customerFeedback.createdAt));
  return rows.map(({ feedback, projectCode }) => ({
    id: feedback.id,
    rating: feedback.rating,
    comment: feedback.comment,
    project: { id: feedback.projectId, code: projectCode },
    createdAt: feedback.createdAt.toISOString(),
  }));
}

/** Leads the customer referred from the app, newest first. */
export async function customerReferrals(
  db: Database,
  customerId: string,
): Promise<CustomerReferral[]> {
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      city: leads.city,
      stage: leads.stage,
      customerId: leads.customerId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(eq(leads.referredByCustomerId, customerId))
    .orderBy(desc(leads.createdAt));
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
