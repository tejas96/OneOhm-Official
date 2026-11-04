import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  documentRequests,
  documents,
  notify,
  projectActivities,
} from '@oneohm/database';
import { ACCEPTED_FILE_TYPES } from '@oneohm/domain';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { propertyOfProject, storageScope } from '../documents/document-links';
import { forCustomer, readRequests } from '../documents/document-request-read';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { tellWaitingOwners } from './tell-waiting-owners';

/** Papers the team asked this customer for, and the upload that answers one (PRD 5.4). */
@Injectable()
export class CustomerDocumentRequestsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async list(customerId: string): Promise<CustomerDocumentRequest[]> {
    const rows = await readRequests(
      this.db,
      and(eq(documentRequests.customerId, customerId), ne(documentRequests.status, 'cancelled')),
    );
    return rows.map(forCustomer);
  }

  async answer(
    customerId: string,
    id: string,
    file: IncomingFile | undefined,
  ): Promise<CustomerDocumentRequest> {
    const { asked, customer } = await this.openRequest(customerId, id);
    const checked = checkFile(file, undefined, asked.title);
    const scope = storageScope({ projectId: asked.projectId, customerId });
    const storageKey = `${scope}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    await this.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          customerId,
          projectId: asked.projectId,
          propertyId: await propertyOfProject(tx, asked.projectId),
          category: asked.category,
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing');
      await this.received(tx, asked, customer, document.id);
    });
    return this.read(id);
  }

  /**
   * Answers the request with a file already stored for this customer (a WhatsApp file is
   * kept once, the moment it arrives): the same document is filed on the request's home
   * under its kind and named after it, with no second copy. Runs in `db` when given (the
   * WhatsApp chat's locked transaction), so the answer and the chat move together.
   */
  async answerWithDocument(
    customerId: string,
    requestId: string,
    documentId: string,
    db: DatabaseExecutor = this.db,
  ): Promise<CustomerDocumentRequest> {
    const { asked, customer } = await this.openRequest(customerId, requestId, db);
    const [stored] = await db
      .select({ name: documents.name, contentType: documents.contentType })
      .from(documents)
      .where(
        and(
          eq(documents.id, documentId),
          eq(documents.customerId, customerId),
          isNull(documents.removedAt),
        ),
      );
    if (!stored) throw notFound('That file');
    if (!(ACCEPTED_FILE_TYPES as readonly string[]).includes(stored.contentType))
      throw invalid('Send a photo or a PDF.', { file: 'This file type is not accepted.' });
    const extension = stored.name.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '';
    await db.transaction(async (tx) => {
      await tx
        .update(documents)
        .set({
          projectId: asked.projectId,
          propertyId: await propertyOfProject(tx, asked.projectId),
          category: asked.category,
          name: `${asked.title.trim().slice(0, 150)}${extension}`,
        })
        .where(eq(documents.id, documentId));
      await this.received(tx, asked, customer, documentId);
    });
    return this.read(requestId, db);
  }

  private async openRequest(customerId: string, id: string, db: DatabaseExecutor = this.db) {
    const [request] = await db
      .select({ asked: documentRequests, customer: customers.name })
      .from(documentRequests)
      .innerJoin(customers, eq(customers.id, documentRequests.customerId))
      .where(and(eq(documentRequests.id, id), eq(documentRequests.customerId, customerId)))
      .limit(1);
    if (!request) throw notFound('That request');
    const { asked } = request;
    if (asked.status !== 'open') {
      throw conflict(
        asked.status === 'received'
          ? 'You have already sent this. Thank you.'
          : 'This paper is no longer needed.',
        asked.status,
      );
    }
    return request;
  }

  /** The request is received with this document: logged, its asker told, audited. */
  private async received(
    tx: DatabaseExecutor,
    asked: typeof documentRequests.$inferSelect,
    customer: string,
    documentId: string,
  ): Promise<void> {
    const id = asked.id;
    const now = new Date();
    // Of two answers at once, only one is filed; the other rolls back.
    const [claimed] = await tx
      .update(documentRequests)
      .set({ status: 'received', documentId, receivedAt: now, updatedAt: now })
      .where(and(eq(documentRequests.id, id), eq(documentRequests.status, 'open')))
      .returning({ id: documentRequests.id });
    if (!claimed) throw conflict('You have already sent this. Thank you.', 'received');
    if (asked.projectId)
      await tx.insert(projectActivities).values({
        projectId: asked.projectId,
        kind: 'document_received',
        message: `${customer} sent ${asked.title}`,
        data: { documentRequestId: id, documentId },
      });
    if (asked.requestedByUserId) {
      await notify(
        tx,
        { userId: asked.requestedByUserId },
        {
          kind: 'document_received',
          title: `${customer} sent ${asked.title}`,
          body: 'It is filed in the project documents.',
          ...(asked.projectId
            ? { subject: { type: 'project', id: asked.projectId, projectId: asked.projectId } }
            : {}),
          dedupeKey: `document_received:${id}`,
        },
      );
    }
    if (asked.projectId)
      await tellWaitingOwners(tx, asked.projectId, {
        title: `${customer} sent ${asked.title}`,
        dedupeKey: `document_received:${id}`,
        exceptUserId: asked.requestedByUserId,
      });
    await recordAudit(tx, null, 'document_request.answered', 'document_request', id, {
      documentId,
    });
  }

  private async read(id: string, db: DatabaseExecutor = this.db): Promise<CustomerDocumentRequest> {
    const [updated] = await readRequests(db, eq(documentRequests.id, id));
    if (!updated) throw notFound('That request');
    return forCustomer(updated);
  }
}
