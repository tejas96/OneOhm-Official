import type { ServiceRequest, ServiceTicket } from '@oneohm/api-contracts';
import {
  amcVisits,
  customers,
  type DatabaseExecutor,
  projects,
  serviceCategories,
  serviceRatings,
  serviceRequests,
  users,
} from '@oneohm/database';
import {
  factLabel,
  isAudioType,
  isVideoType,
  MAINTENANCE_VISIT_CATEGORY,
  serviceSla,
} from '@oneohm/domain';
import { desc, eq, type SQL } from 'drizzle-orm';
import { filesOfRequests, type RequestFiles } from './service-request-photos';

const NO_FILES: RequestFiles = { photos: [], media: [] };

/**
 * Service requests with what both the desk and the customer app show: the category's
 * words, the visit day of a planned AMC visit, the customer's rating and the photos.
 */
export async function serviceRequestRows(db: DatabaseExecutor, where?: SQL) {
  const rows = await db
    .select({
      request: serviceRequests,
      customer: { id: customers.id, name: customers.name, phone: customers.phoneE164 },
      projectCode: projects.code,
      assigneeName: users.fullName,
      label: serviceCategories.label,
      customerLabel: serviceCategories.customerLabel,
      visitDueOn: amcVisits.dueOn,
      rating: serviceRatings.rating,
      ratingComment: serviceRatings.comment,
      ratedAt: serviceRatings.createdAt,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
    .leftJoin(users, eq(users.id, serviceRequests.assigneeUserId))
    .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
    .leftJoin(amcVisits, eq(amcVisits.serviceRequestId, serviceRequests.id))
    .leftJoin(serviceRatings, eq(serviceRatings.serviceRequestId, serviceRequests.id))
    .where(where)
    .orderBy(desc(serviceRequests.createdAt));
  const files = await filesOfRequests(
    db,
    rows.map(({ request }) => request.id),
  );
  return rows.map((row) => ({ ...row, ...(files.get(row.request.id) ?? NO_FILES) }));
}

type Row = Awaited<ReturnType<typeof serviceRequestRows>>[number];
type Status = ServiceTicket['status'];

const STATUSES = new Set<string>(['open', 'in_progress', 'resolved']);
const statusOf = (value: string): Status => (STATUSES.has(value) ? (value as Status) : 'open');
const iso = (at: Date | null) => at?.toISOString() ?? null;

function shared(row: Row) {
  const { request } = row;
  return {
    id: request.id,
    category: request.category,
    kind:
      row.visitDueOn || request.category === MAINTENANCE_VISIT_CATEGORY
        ? ('maintenance_visit' as const)
        : ('request' as const),
    scheduledFor: row.visitDueOn,
    visitOn: request.visitOn,
    description: request.description,
    status: statusOf(request.status),
    resolutionNote: request.resolutionNote,
    rating:
      row.rating === null || !row.ratedAt
        ? null
        : { rating: row.rating, comment: row.ratingComment, createdAt: row.ratedAt.toISOString() },
    createdAt: request.createdAt.toISOString(),
    resolvedAt: iso(request.resolvedAt),
  };
}

/** The desk's view of a request, with where its service levels stand at `now`. */
export function toTicket(row: Row, now: Date): ServiceTicket {
  const { request } = row;
  return {
    ...shared(row),
    categoryLabel: row.label ?? factLabel(request.category),
    customer: row.customer,
    project:
      request.projectId && row.projectCode
        ? { id: request.projectId, code: row.projectCode }
        : null,
    assignee:
      request.assigneeUserId && row.assigneeName
        ? { id: request.assigneeUserId, name: row.assigneeName }
        : null,
    photos: row.photos,
    media: row.media,
    responseDueAt: iso(request.responseDueAt),
    resolutionDueAt: iso(request.resolutionDueAt),
    respondedAt: iso(request.respondedAt),
    sla: serviceSla({ ...request, scheduledFor: row.visitDueOn }, now),
  };
}

/** The customer's view of their own request. */
export function toCustomerRequest(row: Row): ServiceRequest {
  return {
    ...shared(row),
    projectCode: row.projectCode,
    categoryLabel: row.customerLabel ?? row.label ?? factLabel(row.request.category),
    photoCount: row.photos.length,
    hasVideo: row.media.some((file) => isVideoType(file.contentType)),
    hasVoiceNote: row.media.some((file) => isAudioType(file.contentType)),
  };
}
