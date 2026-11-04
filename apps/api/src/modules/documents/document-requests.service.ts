import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentRequest,
  DocumentRequestQuery,
  NewDocumentRequest,
  ReaskDocumentRequest,
} from '@oneohm/api-contracts';
import {
  customers,
  documentRequests,
  documents,
  projectActivities,
  projects,
} from '@oneohm/database';
import { and, eq, isNull, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { canUploadDocuments, canViewAllDocuments } from './document-access';
import { propertyOfProject } from './document-links';
import { openRequestsFor, reaskCount } from './document-request-home';
import { askCustomer, tellCancelled } from './document-request-messages';
import { readRequests } from './document-request-read';

/**
 * The team asks a customer for a paper only they hold, such as the latest electricity
 * bill (PRD 5.4, 6.1). The customer gets WhatsApp and an app alert, and answers in the app.
 * A home's paper is asked once per home; an ID or income paper once for the customer.
 */
@Injectable()
export class DocumentRequestsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(actor: Actor, query: DocumentRequestQuery): Promise<DocumentRequest[]> {
    if (!canViewAllDocuments(actor)) throw forbidden();
    const scope = [
      query.projectId ? eq(documentRequests.projectId, query.projectId) : undefined,
      query.customerId ? eq(documentRequests.customerId, query.customerId) : undefined,
    ].filter((condition) => condition !== undefined);
    if (scope.length === 0) {
      throw invalid('Choose a project or a customer.', { projectId: 'Required.' });
    }
    return readRequests(this.db, or(...scope));
  }

  async create(actor: Actor, input: NewDocumentRequest): Promise<DocumentRequest> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const [project] = await this.db
      .select({
        id: projects.id,
        code: projects.code,
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
    const [open] = await openRequestsFor(this.db, project.customerId, {
      category: input.category,
      propertyId: project.propertyId,
    });
    if (open) throw conflict('The customer has already been asked for this.', 'already_asked');
    const id = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documentRequests)
        .values({
          customerId: project.customerId,
          projectId: project.id,
          category: input.category,
          title: input.title.trim(),
          note: input.note?.trim() ?? '',
          requestedByUserId: actor.userId,
        })
        .returning({ id: documentRequests.id });
      if (!row) throw new Error('Document request insert returned nothing');
      const { customer, phone } = project;
      const asked = { id: row.id, projectId: project.id, projectCode: project.code };
      await askCustomer(tx, { ...asked, customer, phone, title: input.title.trim() }, 0);
      await tx.insert(projectActivities).values({
        projectId: project.id,
        kind: 'document_request',
        message: `Asked the customer for ${input.title.trim()} (WhatsApp and app)`,
        userId: actor.userId,
        data: { documentRequestId: row.id },
      });
      await recordAudit(tx, actor.userId, 'document_request.created', 'document_request', row.id, {
        project: project.code,
        category: input.category,
      });
      return row.id;
    });
    return this.one(id);
  }

  async cancel(actor: Actor, id: string): Promise<DocumentRequest> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const request = await this.one(id);
    if (request.status !== 'open') {
      throw conflict('Only an open request can be cancelled.', 'not_open');
    }
    const { phone } = await this.contactOf(request.customerId);
    await this.db.transaction(async (tx) => {
      await tx
        .update(documentRequests)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(documentRequests.id, id));
      if (request.projectId)
        await tx.insert(projectActivities).values({
          projectId: request.projectId,
          kind: 'document_request',
          message: `Request for ${request.title} cancelled`,
          userId: actor.userId,
          data: { documentRequestId: id },
        });
      await recordAudit(tx, actor.userId, 'document_request.cancelled', 'document_request', id);
      await tellCancelled(tx, { id, title: request.title, phone }, actor.userId);
    });
    return this.one(id);
  }

  /**
   * "Not right, ask again" on a received request: it opens again with the staff note the
   * customer sees, the paper is taken off, and the customer is asked again.
   */
  async reask(actor: Actor, id: string, input: ReaskDocumentRequest): Promise<DocumentRequest> {
    if (!canUploadDocuments(actor)) throw forbidden();
    const request = await this.one(id);
    if (request.status !== 'received') {
      throw conflict('Only a received paper can be asked for again.', 'not_received');
    }
    // A newer request for the same paper may already be open: the customer is not asked twice.
    const propertyId = await propertyOfProject(this.db, request.projectId);
    const [open] = await openRequestsFor(this.db, request.customerId, { ...request, propertyId });
    if (open) throw conflict('The customer has already been asked for this.', 'already_asked');
    const customer = await this.contactOf(request.customerId);
    const note = input.note.trim();
    await this.db.transaction(async (tx) => {
      const now = new Date();
      const [reopened] = await tx
        .update(documentRequests)
        .set({ status: 'open', documentId: null, receivedAt: null, note, updatedAt: now })
        .where(and(eq(documentRequests.id, id), eq(documentRequests.status, 'received')))
        .returning({ id: documentRequests.id });
      if (!reopened) throw conflict('This request has changed. Refresh and try again.', 'changed');
      if (request.documentId)
        await tx
          .update(documents)
          .set({ removedAt: now, removedByUserId: actor.userId })
          .where(and(eq(documents.id, request.documentId), isNull(documents.removedAt)));
      const reasks = (await reaskCount(tx, id)) + 1;
      await askCustomer(tx, { ...request, ...customer }, reasks);
      if (request.projectId)
        await tx.insert(projectActivities).values({
          projectId: request.projectId,
          kind: 'document_request',
          message: `Asked the customer again for ${request.title}`,
          userId: actor.userId,
          data: { documentRequestId: id, documentId: request.documentId },
        });
      await recordAudit(tx, actor.userId, 'document_request.reasked', 'document_request', id, {
        note,
        documentId: request.documentId,
      });
    });
    return this.one(id);
  }

  private async contactOf(customerId: string) {
    const [customer] = await this.db
      .select({ customer: customers.name, phone: customers.phoneE164 })
      .from(customers)
      .where(eq(customers.id, customerId));
    if (!customer) throw notFound('That customer');
    return customer;
  }

  private async one(id: string): Promise<DocumentRequest> {
    const [request] = await readRequests(this.db, eq(documentRequests.id, id));
    if (!request) throw notFound('That request');
    return request;
  }
}
