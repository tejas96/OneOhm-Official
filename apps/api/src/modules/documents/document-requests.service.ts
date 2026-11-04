import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentRequest,
  DocumentRequestQuery,
  NewDocumentRequest,
  ReaskDocumentRequest,
} from '@oneohm/api-contracts';
import { customerActions, customers, leads, projects, quotations } from '@oneohm/database';
import { type Capability, nextActionStatus, rightsForAsk } from '@oneohm/domain';
import { and, eq, ne, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { leadVisibility } from '../crm/lead-read';
import { tellActionCancelled } from '../send-to-customer/send-cancel';
import { logAction } from './customer-action-log';
import { canUploadDocuments, canViewAllDocuments } from './document-access';
import { homeOfRequest, openRequestsFor } from './document-request-home';
import { askCustomer, tellCancelled } from './document-request-messages';
import { readRequests } from './document-request-read';
import { contactOf, reopenRequest } from './document-request-reopen';

/** Where a paper is asked: a project, or a lead's site before any project exists. */
interface Target {
  readonly customerId: string;
  readonly customer: string;
  readonly phone: string;
  readonly projectId: string | null;
  readonly projectCode: string | null;
  readonly leadId: string | null;
  readonly propertyId: string | null;
}

/**
 * The team asks a customer for a paper only they hold, such as the latest electricity
 * bill (PRD 5.4, 6.1): a customer action of type paper. The customer gets WhatsApp and an
 * app alert, and answers in the app or on WhatsApp; the team then checks the paper. A
 * home's paper is asked once per checklist item; an ID or income paper once for the customer.
 */
@Injectable()
export class DocumentRequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(actor: Actor, query: DocumentRequestQuery): Promise<DocumentRequest[]> {
    if (!canViewAllDocuments(actor)) throw forbidden();
    const scope = [
      query.projectId ? eq(customerActions.projectId, query.projectId) : undefined,
      query.customerId ? eq(customerActions.customerId, query.customerId) : undefined,
      query.leadId ? eq(customerActions.leadId, query.leadId) : undefined,
    ].filter((condition) => condition !== undefined);
    if (scope.length === 0) {
      throw invalid('Choose a project, a lead or a customer.', { projectId: 'Required.' });
    }
    return readRequests(this.db, or(...scope), true);
  }

  async create(actor: Actor, input: NewDocumentRequest): Promise<DocumentRequest> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const target = await this.target(actor, input);
    const title = input.title.trim();
    const requirementKey = input.requirementKey ?? null;
    const [open] = await openRequestsFor(this.db, target.customerId, {
      category: input.category,
      propertyId: target.propertyId,
      requirementKey,
    });
    if (open) throw conflict('The customer has already been asked for this.', 'already_asked');
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(customerActions)
        .values({
          type: 'paper',
          customerId: target.customerId,
          projectId: target.projectId,
          leadId: target.leadId,
          propertyId: target.propertyId,
          category: input.category,
          title,
          requirementKey,
          note: input.note?.trim() ?? '',
          requestedByUserId: actor.userId,
        })
        .returning({ id: customerActions.id });
      if (!row) throw new Error('Customer action insert returned nothing');
      await askCustomer(tx, { ...target, id: row.id, title }, 0);
      await logAction(tx, target, {
        kind: 'document_request',
        message: `Asked the customer for ${title} (WhatsApp and app)`,
        userId: actor.userId,
        data: { customerActionId: row.id },
      });
      await recordAudit(tx, actor.userId, 'customer_action.created', 'customer_action', row.id, {
        type: 'paper',
        ...(target.projectCode ? { project: target.projectCode } : { leadId: target.leadId }),
        category: input.category,
      });
      return row.id;
    });
    return this.one(id);
  }

  async cancel(actor: Actor, id: string): Promise<DocumentRequest> {
    const request = await this.one(id);
    // A paper needs the documents rights; the other asks the rights of sending them.
    if (!rightsForAsk(request.type).some((right) => can(actor, right as Capability))) {
      throw forbidden();
    }
    if (!nextActionStatus(request.type, request.status, 'cancel')) {
      throw conflict('Only an open request can be cancelled.', 'not_open');
    }
    const { phone } = await contactOf(this.db, request.customerId);
    const [row] = await this.db
      .select({ propertyId: customerActions.propertyId })
      .from(customerActions)
      .where(eq(customerActions.id, id));
    await this.db.transaction(async (tx) => {
      await tx
        .update(customerActions)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(customerActions.id, id));
      await logAction(tx, request, {
        kind: 'document_request',
        message: `Request for ${request.title} cancelled`,
        userId: actor.userId,
        data: { customerActionId: id },
      });
      await recordAudit(tx, actor.userId, 'customer_action.cancelled', 'customer_action', id);
      if (request.type === 'paper')
        await tellCancelled(tx, { id, title: request.title, phone }, actor.userId);
      else if (request.type === 'location' || request.type === 'pay' || request.type === 'callback')
        await tellActionCancelled(
          tx,
          {
            id,
            type: request.type,
            projectId: request.projectId,
            propertyId: row?.propertyId ?? null,
          },
          phone,
          actor.userId,
        );
    });
    return this.one(id);
  }

  /**
   * "Not right, ask again" on a received (or closed) request: it opens again with the
   * staff reason the customer sees, the paper is taken off, and the customer is asked again.
   */
  async reask(actor: Actor, id: string, input: ReaskDocumentRequest): Promise<DocumentRequest> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const request = await this.one(id);
    if (request.type !== 'paper' || !nextActionStatus('paper', request.status, 'ask_again')) {
      throw conflict('Only a received paper can be asked for again.', 'not_received');
    }
    // A newer request for the same paper may already be open: the customer is not asked twice.
    const [open] = await openRequestsFor(this.db, request.customerId, {
      ...request,
      propertyId: await homeOfRequest(this.db, id),
    });
    if (open) throw conflict('The customer has already been asked for this.', 'already_asked');
    await this.db.transaction((tx) =>
      reopenRequest(tx, actor.userId, request, {
        note: input.note.trim(),
        // A paper the team filed is theirs to keep; only the customer's own is taken off.
        removePaper: request.documentByTeam !== true,
      }),
    );
    return this.one(id);
  }

  /** The project's (or lead's) customer, contact and home for a new ask. */
  private async target(actor: Actor, input: NewDocumentRequest): Promise<Target> {
    if (input.projectId) {
      const [project] = await this.db
        .select({
          projectId: projects.id,
          projectCode: projects.code,
          customerId: customers.id,
          propertyId: projects.propertyId,
          customer: customers.name,
          phone: customers.phoneE164,
        })
        .from(projects)
        .innerJoin(customers, eq(customers.id, projects.customerId))
        .where(eq(projects.id, input.projectId))
        .limit(1);
      if (!project) throw notFound('That project');
      return { ...project, leadId: null };
    }
    const [lead] = await this.db
      .select({
        leadId: leads.id,
        customerId: customers.id,
        propertyId: leads.propertyId,
        customer: customers.name,
        phone: customers.phoneE164,
      })
      .from(leads)
      .leftJoin(customers, eq(customers.id, leads.customerId))
      .where(and(eq(leads.id, input.leadId ?? ''), leadVisibility(actor)))
      .limit(1);
    // A lead this person cannot see is "not found", never a hint about its site.
    if (!lead) throw notFound('That lead');
    if (!lead.customerId || !lead.customer || !lead.phone) {
      throw invalid('Add the site to this lead first, then ask for its papers.', {
        leadId: 'Add the site first.',
      });
    }
    const [started] = await this.db
      .select({ code: projects.code })
      .from(projects)
      .innerJoin(quotations, eq(quotations.id, projects.quotationId))
      .where(and(eq(quotations.leadId, lead.leadId), ne(projects.status, 'cancelled')))
      .limit(1);
    if (started) {
      throw conflict(
        `This lead already has project ${started.code}. Ask on the project.`,
        'has_project',
      );
    }
    return {
      ...lead,
      customerId: lead.customerId,
      customer: lead.customer,
      phone: lead.phone,
      projectId: null,
      projectCode: null,
    };
  }

  private async one(id: string): Promise<DocumentRequest> {
    const [request] = await readRequests(this.db, eq(customerActions.id, id), true);
    if (!request) throw notFound('That request');
    return request;
  }
}
