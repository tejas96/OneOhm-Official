import { Inject, Injectable } from '@nestjs/common';
import type { ChangeRequestDetail, ChangeRequestSummary } from '@oneohm/api-contracts';
import {
  changeRequestSteps,
  changeRequests,
  customers,
  projectActivities,
  projects,
  properties,
  quotations,
} from '@oneohm/database';
import {
  CHANGE_REQUEST_DEFINITIONS,
  type ChangeRequestSuggestion,
  type ChangeRequestType,
  pickAssignee,
  suggestChangeRequests,
  validateChangeRequestValues,
} from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { and, desc, eq, like, type SQL, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { queueWhatsApp } from '../../common/outbox';
import { DATABASE, type Database } from '../../config/core.module';
import { loadAssigneeCandidates } from '../projects/task-library.loader';
import { changeRequestSummaries, presentChangeRequest } from './change-request-read';

@Injectable()
export class ChangeRequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  list(query: {
    status?: ChangeRequestSummary['status'] | undefined;
    customerId?: string | undefined;
    propertyId?: string | undefined;
    projectId?: string | undefined;
  }): Promise<ChangeRequestSummary[]> {
    const filters: SQL[] = [];
    if (query.status) filters.push(eq(changeRequests.status, query.status));
    if (query.customerId) filters.push(eq(changeRequests.customerId, query.customerId));
    if (query.propertyId) filters.push(eq(changeRequests.propertyId, query.propertyId));
    if (query.projectId) filters.push(eq(changeRequests.projectId, query.projectId));
    return changeRequestSummaries(this.db, filters.length ? and(...filters) : undefined);
  }

  get(id: string): Promise<ChangeRequestDetail> {
    return presentChangeRequest(this.db, id);
  }

  /** Mismatches on a property worth a change request (PRD 3.15, step 2). */
  async suggestions(propertyId: string): Promise<ChangeRequestSuggestion[]> {
    const [row] = await this.db
      .select({ property: properties, customerName: customers.name })
      .from(properties)
      .innerJoin(customers, eq(customers.id, properties.customerId))
      .where(eq(properties.id, propertyId));
    if (!row) throw notFound('That site');
    const [latest] = await this.db
      .select({ capacityWp: quotations.capacityWp })
      .from(quotations)
      .where(eq(quotations.propertyId, propertyId))
      .orderBy(desc(quotations.createdAt))
      .limit(1);
    const open = await this.list({ propertyId, status: 'open' });
    return suggestChangeRequests({
      customerName: row.customerName,
      meterHolderName: row.property.meterHolderName,
      sanctionedLoadW: row.property.sanctionedLoadW,
      consumerNumber: row.property.consumerNumber,
      proposedCapacityWp: latest?.capacityWp ?? null,
    }).filter((suggestion) => !open.some((request) => request.type === suggestion.type));
  }

  /** One step: pick the type, fill its fields; the DISCOM steps are generated and assigned. */
  async create(
    actor: Actor,
    request: {
      type: ChangeRequestType;
      propertyId?: string | undefined;
      projectId?: string | null | undefined;
      values: Record<string, string>;
      note?: string | null | undefined;
    },
  ): Promise<ChangeRequestDetail> {
    const input = { ...request, propertyId: await this.siteOf(request) };
    const definition = CHANGE_REQUEST_DEFINITIONS[input.type];
    const { values, errors } = validateChangeRequestValues(input.type, input.values);
    if (Object.keys(errors).length > 0)
      throw invalid('Fill in the details this request needs.', errors);
    const [row] = await this.db
      .select({ property: properties, customer: customers })
      .from(properties)
      .innerJoin(customers, eq(customers.id, properties.customerId))
      .where(eq(properties.id, input.propertyId));
    if (!row) throw notFound('That site');
    if (input.projectId) {
      const [project] = await this.db
        .select({ propertyId: projects.propertyId })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      if (!project) throw notFound('That project');
      if (project.propertyId !== input.propertyId)
        throw invalid('That project is on a different site.');
    }
    const duplicate = await this.list({ propertyId: input.propertyId, status: 'open' });
    if (duplicate.some((request) => request.type === input.type))
      throw conflict(
        `An open ${definition.title.toLowerCase()} request already exists for this site.`,
        'duplicate',
      );

    const candidates = await loadAssigneeCandidates(this.db);
    const today = todayIn();
    const id = await this.db.transaction(async (tx) => {
      const year = today.slice(0, 4);
      const [count] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(changeRequests)
        .where(like(changeRequests.number, `CR-${year}-%`));
      const number = `CR-${year}-${String((count?.count ?? 0) + 1).padStart(4, '0')}`;
      const [request] = await tx
        .insert(changeRequests)
        .values({
          number,
          type: input.type,
          customerId: row.customer.id,
          propertyId: row.property.id,
          projectId: input.projectId ?? null,
          discomId: row.property.discomId,
          values,
          note: input.note ?? null,
          createdByUserId: actor.userId,
        })
        .returning({ id: changeRequests.id });
      if (!request) throw new Error('Change request insert returned nothing.');
      let due = today;
      for (const [position, step] of definition.steps.entries()) {
        due = addDays(due, step.durationDays);
        const assignee = pickAssignee(candidates, step.roleKey);
        await tx.insert(changeRequestSteps).values({
          changeRequestId: request.id,
          key: step.key,
          title: step.title,
          roleKey: step.roleKey,
          assigneeUserId: assignee?.userId ?? null,
          status: position === 0 ? 'ready' : 'pending',
          waitingParty: step.waitingParty,
          captures: [...step.captures],
          dueDate: due,
          position,
        });
      }
      if (input.projectId) {
        await tx.insert(projectActivities).values({
          projectId: input.projectId,
          kind: 'change_request',
          message: `${definition.title} ${number} raised.`,
          userId: actor.userId,
        });
      }
      if (row.customer.whatsappOptIn) {
        await queueWhatsApp(
          tx,
          row.customer.phoneE164,
          'change_request_raised',
          { customer: row.customer.name, request: definition.title, number },
          `change_request_raised:${request.id}`,
        );
      }
      await recordAudit(tx, actor.userId, 'change_request.created', 'change_request', request.id, {
        type: input.type,
        values,
      });
      return request.id;
    });
    return this.get(id);
  }

  /** The site: as given, or the project's when only the project is named. */
  private async siteOf(request: {
    propertyId?: string | undefined;
    projectId?: string | null | undefined;
  }): Promise<string> {
    if (request.propertyId) return request.propertyId;
    if (!request.projectId) throw invalid('Pick the site.', { propertyId: 'Pick the site.' });
    const [project] = await this.db
      .select({ propertyId: projects.propertyId })
      .from(projects)
      .where(eq(projects.id, request.projectId));
    if (!project) throw notFound('That project');
    return project.propertyId;
  }

  async cancel(actor: Actor, id: string, reason: string): Promise<ChangeRequestDetail> {
    const [request] = await this.db.select().from(changeRequests).where(eq(changeRequests.id, id));
    if (!request) throw notFound('That change request');
    if (request.status !== 'open')
      throw conflict('This change request is already closed.', 'closed');
    await this.db
      .update(changeRequests)
      .set({ status: 'cancelled', cancelledReason: reason, updatedAt: new Date() })
      .where(eq(changeRequests.id, id));
    await recordAudit(this.db, actor.userId, 'change_request.cancelled', 'change_request', id, {
      reason,
    });
    return this.get(id);
  }
}
