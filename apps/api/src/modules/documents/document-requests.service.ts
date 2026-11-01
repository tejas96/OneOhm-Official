import { Inject, Injectable } from '@nestjs/common';
import type {
  DocumentRequest,
  DocumentRequestQuery,
  NewDocumentRequest,
} from '@oneohm/api-contracts';
import { customers, documentRequests, projects, queueCustomerMessage } from '@oneohm/database';
import { and, eq, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { canUploadDocuments, canViewAllDocuments } from './document-access';
import { readRequests } from './document-request-read';

/**
 * The team asks a customer for a paper only they hold, such as the latest electricity
 * bill (PRD 5.4, 6.1). The customer gets WhatsApp and an app alert, and answers in the app.
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
        customer: customers.name,
        phone: customers.phoneE164,
      })
      .from(projects)
      .innerJoin(customers, eq(customers.id, projects.customerId))
      .where(eq(projects.id, input.projectId))
      .limit(1);
    if (!project) throw notFound('That project');
    const [open] = await this.db
      .select({ id: documentRequests.id })
      .from(documentRequests)
      .where(
        and(
          eq(documentRequests.customerId, project.customerId),
          eq(documentRequests.category, input.category),
          eq(documentRequests.status, 'open'),
        ),
      )
      .limit(1);
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
      await queueCustomerMessage(
        tx,
        project.phone,
        'document_requested',
        { customer: project.customer, document: input.title.trim(), project: project.code },
        `document_requested:${row.id}`,
      );
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
    await this.db.transaction(async (tx) => {
      await tx
        .update(documentRequests)
        .set({ status: 'cancelled', cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(documentRequests.id, id));
      await recordAudit(tx, actor.userId, 'document_request.cancelled', 'document_request', id);
    });
    return this.one(id);
  }

  private async one(id: string): Promise<DocumentRequest> {
    const [request] = await readRequests(this.db, eq(documentRequests.id, id));
    if (!request) throw notFound('That request');
    return request;
  }
}
