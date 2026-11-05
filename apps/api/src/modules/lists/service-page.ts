import type { ServicePage, servicePageQuerySchema } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  projects,
  serviceCategories,
  serviceRequests,
} from '@oneohm/database';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { offsetOf, pageFrom, slicePage } from '../../common/paging';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { matchesSla } from '../service-desk/service-desk.service';
import { serviceSearch } from './service-search';

type Query = z.infer<typeof servicePageQuerySchema>;

/**
 * One page of the service desk, newest first. Kind and the SLA clocks are worked out
 * from each request's category, so with those filters the matching requests are read
 * whole and then cut; without them only the page is read. The search works in both.
 */
export async function servicePage(db: DatabaseExecutor, query: Query): Promise<ServicePage> {
  const where = and(
    query.status ? eq(serviceRequests.status, query.status) : undefined,
    query.id ? eq(serviceRequests.id, query.id) : undefined,
    serviceSearch(query.q),
  );
  const now = new Date();
  if (query.kind || query.sla) {
    const tickets = (await serviceRequestRows(db, where))
      .map((row) => toTicket(row, now))
      .filter((ticket) => !query.kind || ticket.kind === query.kind)
      .filter((ticket) => matchesSla(ticket, query.sla));
    return slicePage(tickets, query);
  }
  const offset = offsetOf(query);
  // The same joins as the desk rows, so the search can look at the customer and category.
  const [ids, [count]] = await Promise.all([
    db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
      .where(where)
      .orderBy(desc(serviceRequests.createdAt), asc(serviceRequests.id))
      .limit(query.limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .leftJoin(serviceCategories, eq(serviceCategories.key, serviceRequests.category))
      .where(where),
  ]);
  const order = ids.map((row) => row.id);
  const rows = order.length ? await serviceRequestRows(db, inArray(serviceRequests.id, order)) : [];
  const tickets = rows
    .map((row) => toTicket(row, now))
    .sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  return pageFrom(tickets, count?.total ?? 0, offset, query.limit);
}
