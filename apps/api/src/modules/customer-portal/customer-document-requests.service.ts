import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { customers, documentRequests, documents, notify } from '@oneohm/database';
import { and, eq, ne } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { storageScope } from '../documents/document-links';
import { forCustomer, readRequests } from '../documents/document-request-read';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';

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
    const [request] = await this.db
      .select({ request: documentRequests, customer: customers.name })
      .from(documentRequests)
      .innerJoin(customers, eq(customers.id, documentRequests.customerId))
      .where(and(eq(documentRequests.id, id), eq(documentRequests.customerId, customerId)))
      .limit(1);
    if (!request) throw notFound('That request');
    const { request: asked } = request;
    if (asked.status !== 'open') {
      throw conflict(
        asked.status === 'received'
          ? 'You have already sent this. Thank you.'
          : 'OneOhm no longer needs this paper.',
        asked.status,
      );
    }
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
          category: asked.category,
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing');
      const now = new Date();
      await tx
        .update(documentRequests)
        .set({ status: 'received', documentId: document.id, receivedAt: now, updatedAt: now })
        .where(eq(documentRequests.id, id));
      if (asked.requestedByUserId) {
        await notify(
          tx,
          { userId: asked.requestedByUserId },
          {
            kind: 'document_received',
            title: `${request.customer} sent ${asked.title}`,
            body: 'It is filed in the project documents.',
            ...(asked.projectId
              ? { subject: { type: 'project', id: asked.projectId, projectId: asked.projectId } }
              : {}),
            dedupeKey: `document_received:${id}`,
          },
        );
      }
      await recordAudit(tx, null, 'document_request.answered', 'document_request', id, {
        documentId: document.id,
      });
    });
    const [updated] = await readRequests(this.db, eq(documentRequests.id, id));
    if (!updated) throw notFound('That request');
    return forCustomer(updated);
  }
}
