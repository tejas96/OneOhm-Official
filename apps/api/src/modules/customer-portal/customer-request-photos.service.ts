import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ServiceRequest } from '@oneohm/api-contracts';
import { documents, serviceRequests } from '@oneohm/database';
import {
  type DetectedFileType,
  isAudioType,
  PHOTO_FILE_TYPES,
  REQUEST_FILE_LIMITS,
  REQUEST_FILE_TYPES,
  type RequestFileKind,
  requestFileFits,
  requestFileKind,
  VOICE_NOTE_CATEGORY,
} from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { conflict, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { propertyOfProject } from '../documents/document-links';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { CustomerPortalService } from './customer-portal.service';

const FULL: Readonly<Record<RequestFileKind, string>> = {
  photo: `A request can have up to ${REQUEST_FILE_LIMITS.photo} photos.`,
  video: 'This request already has a video.',
  voice_note: 'This request already has a voice note.',
};

/**
 * What the customer adds to their own help request (PRD 5.5): photos of the problem, one
 * short video and one voice note. Videos are filed as site photos and voice notes apart,
 * as the field app files them; none shows in the customer's Documents.
 */
@Injectable()
export class CustomerRequestPhotosService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly portal: CustomerPortalService,
  ) {}

  /** One photo (the app's photo strip). */
  add(customerId: string, requestId: string, file: IncomingFile | undefined) {
    return this.attach(customerId, requestId, file, PHOTO_FILE_TYPES);
  }

  /** One photo from the WhatsApp assistant; returns the stored document's id. */
  addPhotoFile(customerId: string, requestId: string, file: IncomingFile): Promise<string> {
    return this.store(customerId, requestId, file, PHOTO_FILE_TYPES);
  }

  /** A photo, a short video or a voice note. */
  addFile(customerId: string, requestId: string, file: IncomingFile | undefined) {
    return this.attach(customerId, requestId, file, REQUEST_FILE_TYPES);
  }

  private async attach(
    customerId: string,
    requestId: string,
    file: IncomingFile | undefined,
    allowed: readonly DetectedFileType[],
  ): Promise<ServiceRequest> {
    await this.store(customerId, requestId, file, allowed);
    const updated = (await this.portal.serviceRequests(customerId)).find(
      (item) => item.id === requestId,
    );
    if (!updated) throw notFound('That request');
    return updated;
  }

  private async store(
    customerId: string,
    requestId: string,
    file: IncomingFile | undefined,
    allowed: readonly DetectedFileType[],
  ): Promise<string> {
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
    const checked = checkFile(file, allowed);
    const existing = await this.db
      .select({ contentType: documents.contentType })
      .from(documents)
      // The customer's own files only; the technician's visit files do not count.
      .where(
        and(
          eq(documents.serviceRequestId, requestId),
          isNull(documents.uploadedByUserId),
          isNull(documents.removedAt),
        ),
      );
    const types = existing.map((row) => row.contentType);
    if (!requestFileFits(checked.contentType, types))
      throw conflict(FULL[requestFileKind(checked.contentType)], 'too_many');
    const storageKey = `customers/${customerId}/service/${requestId}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const [row] = await this.db
      .insert(documents)
      .values({
        customerId,
        projectId: request.projectId,
        propertyId: await propertyOfProject(this.db, request.projectId),
        serviceRequestId: requestId,
        category: isAudioType(checked.contentType) ? VOICE_NOTE_CATEGORY : 'site_photo',
        source: 'upload',
        name: checked.name,
        storageKey,
        contentType: checked.contentType,
        sizeBytes: checked.buffer.length,
      })
      .returning({ id: documents.id });
    if (!row) throw new Error('Document insert returned nothing');
    return row.id;
  }
}
