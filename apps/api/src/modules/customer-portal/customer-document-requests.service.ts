import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { customerActions, customers, type DatabaseExecutor, documents } from '@oneohm/database';
import { ACCEPTED_FILE_TYPES } from '@oneohm/domain';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { propertyOfProject, storageScope } from '../documents/document-links';
import { forCustomer, readRequests } from '../documents/document-request-read';
import { ObjectStorageService } from '../documents/object-storage.service';
import { markRequestReceived } from '../documents/request-received';
import { checkFile, type IncomingFile } from '../documents/upload-file';

const sent = (customer: string, asked: { title: string }) => `${customer} sent ${asked.title}`;

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
      and(eq(customerActions.customerId, customerId), ne(customerActions.status, 'cancelled')),
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
          leadId: asked.leadId,
          propertyId: (await propertyOfProject(tx, asked.projectId)) ?? asked.propertyId,
          category: asked.category ?? 'other',
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing');
      await markRequestReceived(tx, asked, document.id, {
        userId: null,
        said: sent(customer, asked),
      });
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
          leadId: asked.leadId,
          propertyId: (await propertyOfProject(tx, asked.projectId)) ?? asked.propertyId,
          category: asked.category ?? 'other',
          name: `${asked.title.trim().slice(0, 150)}${extension}`,
        })
        .where(eq(documents.id, documentId));
      await markRequestReceived(tx, asked, documentId, {
        userId: null,
        said: sent(customer, asked),
      });
    });
    return this.read(requestId, db);
  }

  private async openRequest(customerId: string, id: string, db: DatabaseExecutor = this.db) {
    const [request] = await db
      .select({ asked: customerActions, customer: customers.name })
      .from(customerActions)
      .innerJoin(customers, eq(customers.id, customerActions.customerId))
      .where(
        and(
          eq(customerActions.id, id),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'paper'),
        ),
      )
      .limit(1);
    if (!request) throw notFound('That request');
    const { asked } = request;
    if (asked.status !== 'open') {
      throw conflict(
        asked.status === 'received' || asked.status === 'closed'
          ? 'You have already sent this. Thank you.'
          : 'This paper is no longer needed.',
        asked.status,
      );
    }
    return request;
  }

  private async read(id: string, db: DatabaseExecutor = this.db): Promise<CustomerDocumentRequest> {
    const [updated] = await readRequests(db, eq(customerActions.id, id));
    if (!updated) throw notFound('That request');
    return forCustomer(updated);
  }
}
