import { Inject, Injectable } from '@nestjs/common';
import type { FeedbackEntry, ServiceTicket } from '@oneohm/api-contracts';
import { customerFeedback, customers, projects, serviceRequests, users } from '@oneohm/database';
import { desc, eq, type SQL } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';

type Ticket = ServiceTicket;
type Patch = {
  status?: Ticket['status'] | undefined;
  assigneeUserId?: string | null | undefined;
  resolutionNote?: string | null | undefined;
};

const CATEGORY_LABEL: Readonly<Record<Ticket['category'], string>> = {
  no_generation: 'no generation',
  low_generation: 'low generation',
  inverter_error: 'an inverter error',
  physical_damage: 'physical damage',
  cleaning: 'panel cleaning',
  billing_net_meter: 'billing or the net meter',
  subsidy: 'your subsidy',
  other: 'your request',
};
const STATUS_LABEL: Readonly<Record<Ticket['status'], string>> = {
  open: 'received',
  in_progress: 'being worked on',
  resolved: 'resolved',
};

/** Customer service requests and ratings, as the office sees and works them. */
@Injectable()
export class ServiceDeskService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async tickets(where?: SQL): Promise<Ticket[]> {
    const rows = await this.db
      .select({
        request: serviceRequests,
        customer: { id: customers.id, name: customers.name, phone: customers.phoneE164 },
        projectCode: projects.code,
        assigneeName: users.fullName,
      })
      .from(serviceRequests)
      .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
      .leftJoin(projects, eq(projects.id, serviceRequests.projectId))
      .leftJoin(users, eq(users.id, serviceRequests.assigneeUserId))
      .where(where)
      .orderBy(desc(serviceRequests.createdAt));
    return rows.map(({ request, customer, projectCode, assigneeName }) => ({
      id: request.id,
      category: request.category as Ticket['category'],
      description: request.description,
      status: request.status as Ticket['status'],
      customer,
      project:
        request.projectId && projectCode ? { id: request.projectId, code: projectCode } : null,
      assignee:
        request.assigneeUserId && assigneeName
          ? { id: request.assigneeUserId, name: assigneeName }
          : null,
      resolutionNote: request.resolutionNote,
      createdAt: request.createdAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    }));
  }

  async update(actorId: string, id: string, patch: Patch): Promise<Ticket> {
    const [current] = await this.tickets(eq(serviceRequests.id, id));
    if (!current) throw notFound('That service request');
    const resolving = patch.status === 'resolved' && current.status !== 'resolved';
    await this.db.transaction(async (tx) => {
      await tx
        .update(serviceRequests)
        .set({
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.assigneeUserId !== undefined ? { assigneeUserId: patch.assigneeUserId } : {}),
          ...(patch.resolutionNote !== undefined ? { resolutionNote: patch.resolutionNote } : {}),
          ...(patch.status ? { resolvedAt: patch.status === 'resolved' ? new Date() : null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(serviceRequests.id, id));
      if (patch.status && patch.status !== current.status) {
        await queueWhatsApp(
          tx,
          current.customer.phone,
          'service_update',
          {
            customer: current.customer.name,
            topic: CATEGORY_LABEL[current.category],
            status: STATUS_LABEL[patch.status],
          },
          `service:${id}:${patch.status}:${Date.now()}`,
        );
      }
      await recordAudit(
        tx,
        actorId,
        resolving ? 'service.resolved' : 'service.updated',
        'service_request',
        id,
        patch,
      );
    });
    const [updated] = await this.tickets(eq(serviceRequests.id, id));
    if (!updated) throw notFound('That service request');
    return updated;
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
