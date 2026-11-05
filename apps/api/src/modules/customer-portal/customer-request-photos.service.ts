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
import { and, eq, isNull, ne } from 'drizzle-orm';
import { conflict, invalid, notFound } from '../../common/http/errors';
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

  /**
   * The app's rule for a photo or voice note the customer already sent on WhatsApp (stored once
   * when it arrived): the request it may join and the folder it goes in, or an error saying why not.
   */
  async roomForStoredFile(
    customerId: string,
    requestId: string,
    documentId: string,
  ): Promise<{ readonly projectId: string | null; readonly category: string }> {
    const [stored] = await this.db
      .select({ contentType: documents.contentType })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.customerId, customerId)));
    if (!stored) throw notFound('That file');
    const voice = isAudioType(stored.contentType);
    const allowed: readonly string[] = voice ? REQUEST_FILE_TYPES : PHOTO_FILE_TYPES;
    if (!allowed.includes(stored.contentType))
      throw invalid('Send a photo.', { file: 'This file type is not accepted.' });
    const request = await this.roomFor(customerId, requestId, stored.contentType, documentId);
    return { projectId: request.projectId, category: voice ? VOICE_NOTE_CATEGORY : 'site_photo' };
  }

  private async store(
    customerId: string,
    requestId: string,
    file: IncomingFile | undefined,
    allowed: readonly DetectedFileType[],
  ): Promise<string> {
    const checked = checkFile(file, allowed);
    const request = await this.roomFor(customerId, requestId, checked.contentType);
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

  /**
   * The customer's own open request, with room for one more file of this type. The file
   * being filed (`filing`) is not counted: on a retry it may already sit on the request.
   */
  private async roomFor(
    customerId: string,
    requestId: string,
    contentType: string,
    filing?: string,
  ) {
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
      .select({ contentType: documents.contentType })
      .from(documents)
      // The customer's own files only; the technician's visit files do not count.
      .where(
        and(
          eq(documents.serviceRequestId, requestId),
          isNull(documents.uploadedByUserId),
          isNull(documents.removedAt),
          filing ? ne(documents.id, filing) : undefined,
        ),
      );
    const types = existing.map((row) => row.contentType);
    if (!requestFileFits(contentType, types))
      throw conflict(FULL[requestFileKind(contentType)], 'too_many');
    return request;
  }
}
