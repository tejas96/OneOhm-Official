import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ServiceRequest } from '@oneohm/api-contracts';
import { documents, serviceRequests } from '@oneohm/database';
import { PHOTO_FILE_TYPES } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { CustomerPortalService } from './customer-portal.service';

/** Most a customer can add to one request: enough to show the problem. */
const MAX_PHOTOS = 6;

/** Photos of the problem, added by the customer to their own help request (PRD 5.5). */
@Injectable()
export class CustomerRequestPhotosService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly portal: CustomerPortalService,
  ) {}

  async add(
    customerId: string,
    requestId: string,
    file: IncomingFile | undefined,
  ): Promise<ServiceRequest> {
    const [request] = await this.db
      .select({
        id: serviceRequests.id,
        projectId: serviceRequests.projectId,
        status: serviceRequests.status,
      })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.customerId, customerId)));
    if (!request) throw notFound('That request');
    if (request.status === 'resolved')
      throw conflict('This request is already resolved.', 'resolved');
    const existing = await this.db
      .select({ id: documents.id })
      .from(documents)
      // The customer's own photos only; the technician's visit files do not count.
      .where(and(eq(documents.serviceRequestId, requestId), isNull(documents.uploadedByUserId)));
    if (existing.length >= MAX_PHOTOS)
      throw conflict(`A request can have up to ${MAX_PHOTOS} photos.`, 'too_many');
    const checked = checkFile(file, PHOTO_FILE_TYPES);
    const storageKey = `customers/${customerId}/service/${requestId}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    await this.db.insert(documents).values({
      customerId,
      projectId: request.projectId,
      serviceRequestId: requestId,
      category: 'site_photo',
      source: 'upload',
      name: checked.name,
      storageKey,
      contentType: checked.contentType,
      sizeBytes: checked.buffer.length,
    });
    const updated = (await this.portal.serviceRequests(customerId)).find(
      (item) => item.id === requestId,
    );
    if (!updated) throw notFound('That request');
    return updated;
  }
}
