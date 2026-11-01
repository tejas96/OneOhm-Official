import type { ServiceFieldWork, ServiceJob, ServiceTicket, SiteVisit } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documents,
  projects,
  properties,
  serviceVisitReports,
  siteVisits,
  users,
} from '@oneohm/database';
import type { GeoPoint } from '@oneohm/domain';
import { and, asc, desc, eq, inArray, isNotNull, isNull, type SQL } from 'drizzle-orm';
import { toAttachment } from '../documents/document-read';
import { visitRecords } from '../site-activity/site-visit-read';

export interface ServicePlace {
  readonly id: string;
  readonly label: string;
  readonly address: string;
  readonly city: string;
  readonly located: boolean;
  /** The saved site location, for measuring a check-in (never sent to the app). */
  readonly point: GeoPoint | null;
}

type PlaceRow = typeof properties.$inferSelect;

function toPlace(row: PlaceRow): ServicePlace {
  const point =
    row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude, longitude: row.longitude }
      : null;
  return {
    id: row.id,
    label: row.label,
    address: row.addressLine,
    city: row.city,
    located: point !== null,
    point,
  };
}

/**
 * Where each request's work is: the project's site when it has a project, otherwise the
 * customer's first saved site. Keyed by request id; requests with no site are left out.
 */
export async function placesOf(
  db: DatabaseExecutor,
  tickets: readonly Pick<ServiceTicket, 'id' | 'project' | 'customer'>[],
): Promise<Map<string, ServicePlace>> {
  const projectIds = tickets.flatMap((ticket) => (ticket.project ? [ticket.project.id] : []));
  const customerIds = tickets.map((ticket) => ticket.customer.id);
  if (customerIds.length === 0) return new Map();
  const byProject = projectIds.length
    ? await db
        .select({ projectId: projects.id, place: properties })
        .from(projects)
        .innerJoin(properties, eq(properties.id, projects.propertyId))
        .where(inArray(projects.id, projectIds))
    : [];
  const byCustomer = await db
    .select()
    .from(properties)
    .where(inArray(properties.customerId, customerIds))
    .orderBy(asc(properties.createdAt));
  const places = new Map<string, ServicePlace>();
  for (const ticket of tickets) {
    const fromProject = byProject.find((row) => row.projectId === ticket.project?.id)?.place;
    const fallback = byCustomer.find((row) => row.customerId === ticket.customer.id);
    const row = fromProject ?? fallback;
    if (row) places.set(ticket.id, toPlace(row));
  }
  return places;
}

/** A request as it shows on the technician's list. */
export function toJob(
  ticket: ServiceTicket,
  place: ServicePlace | undefined,
  openVisit: SiteVisit | null,
): ServiceJob {
  return {
    id: ticket.id,
    kind: ticket.kind,
    status: ticket.status,
    categoryLabel: ticket.categoryLabel,
    description: ticket.description,
    customer: ticket.customer,
    place: place
      ? {
          id: place.id,
          label: place.label,
          address: place.address,
          city: place.city,
          located: place.located,
        }
      : null,
    projectCode: ticket.project?.code ?? null,
    scheduledFor: ticket.scheduledFor,
    responseDueAt: ticket.responseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    respondedAt: ticket.respondedAt,
    sla: ticket.sla,
    checkedIn: openVisit?.serviceRequestId === ticket.id,
    createdAt: ticket.createdAt,
  };
}

/** The person's open visit anywhere, if they are checked in somewhere. */
export async function openVisitOf(db: DatabaseExecutor, userId: string) {
  const [open] = await visitRecords(
    db,
    and(eq(siteVisits.userId, userId), isNull(siteVisits.checkOutAt)) as SQL,
  );
  return open ?? null;
}

async function reportsOf(db: DatabaseExecutor, requestId: string) {
  const rows = await db
    .select({ report: serviceVisitReports, fullName: users.fullName })
    .from(serviceVisitReports)
    .innerJoin(users, eq(users.id, serviceVisitReports.userId))
    .where(eq(serviceVisitReports.serviceRequestId, requestId))
    .orderBy(desc(serviceVisitReports.createdAt));
  return rows.map(({ report, fullName }) => ({
    id: report.id,
    user: { id: report.userId, fullName },
    outcome: report.outcome,
    found: report.found,
    workDone: report.workDone,
    reason: report.reason,
    createdAt: report.createdAt.toISOString(),
  }));
}

/** Files the team added on the request's visits (the customer's own photos are apart). */
async function filesOf(db: DatabaseExecutor, requestId: string) {
  const rows = await db
    .select({ document: documents, fullName: users.fullName })
    .from(documents)
    .innerJoin(users, eq(users.id, documents.uploadedByUserId))
    .where(
      and(
        eq(documents.serviceRequestId, requestId),
        isNotNull(documents.uploadedByUserId),
        isNull(documents.removedAt),
        isNull(documents.replacedAt),
      ),
    )
    .orderBy(asc(documents.createdAt));
  return rows.map(({ document, fullName }) => ({
    ...toAttachment(document),
    category: document.category,
    uploadedBy: document.uploadedByUserId ? { id: document.uploadedByUserId, fullName } : null,
  }));
}

/** The visits, notes and evidence of one request. */
export async function fieldWorkOf(
  db: DatabaseExecutor,
  requestId: string,
): Promise<ServiceFieldWork> {
  const [visits, reports, files] = await Promise.all([
    visitRecords(db, eq(siteVisits.serviceRequestId, requestId)),
    reportsOf(db, requestId),
    filesOf(db, requestId),
  ]);
  return { visits, reports, files };
}
