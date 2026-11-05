import { Inject, Injectable } from '@nestjs/common';
import type {
  FeedbackEntry,
  ServiceAssignee,
  ServiceTicket,
  serviceTicketQuerySchema,
} from '@oneohm/api-contracts';
import {
  categoryHours,
  customerFeedback,
  customers,
  holdersOf,
  notify,
  projects,
  serviceCategories,
  serviceRequests,
  users,
} from '@oneohm/database';
import { slaBreached } from '@oneohm/domain';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { recordAudit } from '../../common/audit';
import { invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { serviceRequestRows, toTicket } from '../../common/read-models/service-request-rows';
import { DATABASE, type Database } from '../../config/core.module';
import { followAssignee, lockVisitTarget } from '../visits/follow-assignee';
import { changesFor, type Patch } from './service-ticket-changes';

type Ticket = ServiceTicket;
type Query = z.infer<typeof serviceTicketQuerySchema>;
const STATUS_LABEL: Readonly<Record<Ticket['status'], string>> = {
  open: 'received',
  in_progress: 'being worked on',
  resolved: 'resolved',
};

export function matchesSla(ticket: Ticket, filter: Query['sla']): boolean {
  if (!filter) return true;
  if (filter === 'breached') return slaBreached(ticket.sla);
  return ticket.sla.response === 'due_soon' || ticket.sla.resolution === 'due_soon';
}

type Row = Awaited<ReturnType<typeof serviceRequestRows>>[number];

function assignedNotice(current: Row, owner: string, now: Date) {
  const { request } = current;
  return {
    kind: 'service_assigned',
    title: 'Service request for you',
    body: `${current.label ?? request.category}: ${current.customer.name}. ${request.description.slice(0, 100)}`,
    subject: { type: 'service_request' as const, id: request.id, projectId: request.projectId },
    dedupeKey: `service_assigned:${request.id}:${owner}:${now.getTime()}`,
  };
}

/** Customer service requests and ratings, as the office sees and works them. */
@Injectable()
export class ServiceDeskService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async tickets(query: Query = {}): Promise<Ticket[]> {
    const rows = await serviceRequestRows(
      this.db,
      query.status ? eq(serviceRequests.status, query.status) : undefined,
    );
    const now = new Date();
    return rows
      .map((row) => toTicket(row, now))
      .filter((ticket) => !query.kind || ticket.kind === query.kind)
      .filter((ticket) => matchesSla(ticket, query.sla));
  }

  private async one(id: string) {
    const [row] = await serviceRequestRows(this.db, eq(serviceRequests.id, id));
    if (!row) throw notFound('That service request');
    return row;
  }

  /** Everyone who works service requests, least busy first; people on leave last. */
  async assignees(): Promise<ServiceAssignee[]> {
    const ids = await holdersOf(this.db, 'service.manage');
    if (ids.length === 0) return [];
    const people = await this.db
      .select({ id: users.id, name: users.fullName, onLeave: users.onLeave })
      .from(users)
      .where(inArray(users.id, ids));
    const loads = await this.db
      .select({ userId: serviceRequests.assigneeUserId, open: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(
        and(ne(serviceRequests.status, 'resolved'), inArray(serviceRequests.assigneeUserId, ids)),
      )
      .groupBy(serviceRequests.assigneeUserId);
    return people
      .map((person) => ({
        ...person,
        open: loads.find((load) => load.userId === person.id)?.open ?? 0,
      }))
      .sort(
        (left, right) =>
          Number(left.onLeave) - Number(right.onLeave) ||
          left.open - right.open ||
          left.name.localeCompare(right.name),
      );
  }

  async update(actorId: string, id: string, patch: Patch): Promise<Ticket> {
    const current = await this.one(id);
    const before = current.request;
    const moved = patch.category && patch.category !== before.category ? patch.category : null;
    if (moved) await this.assertCategory(moved);
    // The new category's reply-by and fix-by times replace the old ones.
    const recategory = moved
      ? { hours: await categoryHours(this.db, moved), scheduledFor: current.visitDueOn ?? null }
      : undefined;
    const now = new Date();
    await this.db.transaction(async (tx) => {
      if (patch.assigneeUserId !== undefined) await lockVisitTarget(tx, { serviceRequestId: id });
      await tx
        .update(serviceRequests)
        .set(changesFor(patch, before, now, recategory))
        .where(eq(serviceRequests.id, id));
      if (patch.status && patch.status !== before.status) {
        await queueWhatsApp(
          tx,
          current.customer.phone,
          'service_update',
          {
            customer: current.customer.name,
            topic: (current.customerLabel ?? current.label ?? 'your request').toLowerCase(),
            status: STATUS_LABEL[patch.status],
          },
          `service:${id}:${patch.status}:${now.getTime()}`,
        );
      }
      const owner = patch.assigneeUserId;
      if (owner !== undefined && owner !== before.assigneeUserId)
        await followAssignee(tx, { serviceRequestId: id }, owner, actorId);
      if (owner && owner !== before.assigneeUserId && owner !== actorId) {
        await notify(tx, { userId: owner }, assignedNotice(current, owner, now));
      }
      const resolving = patch.status === 'resolved' && before.status !== 'resolved';
      const action = resolving ? 'service.resolved' : 'service.updated';
      await recordAudit(tx, actorId, action, 'service_request', id, patch);
    });
    return toTicket(await this.one(id), new Date());
  }

  private async assertCategory(key: string): Promise<void> {
    const [row] = await this.db
      .select({ active: serviceCategories.active })
      .from(serviceCategories)
      .where(eq(serviceCategories.key, key));
    if (!row?.active) throw invalid('Pick a category that is in use.', { category: 'Not in use.' });
  }

  async feedback(): Promise<FeedbackEntry[]> {
    const rows = await this.db
      .select({
        entry: customerFeedback,
        customerName: customers.name,
        projectCode: projects.code,
      })
      .from(customerFeedback)
      .innerJoin(customers, eq(customers.id, customerFeedback.customerId))
      .innerJoin(projects, eq(projects.id, customerFeedback.projectId))
      .orderBy(desc(customerFeedback.createdAt));
    return rows.map(({ entry, customerName, projectCode }) => ({
      id: entry.id,
      rating: entry.rating,
      comment: entry.comment,
      customer: { id: entry.customerId, name: customerName },
      project: { id: entry.projectId, code: projectCode },
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}
