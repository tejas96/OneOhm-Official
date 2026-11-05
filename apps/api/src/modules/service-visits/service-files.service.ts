import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type DocumentRecord, geotagFieldsSchema } from '@oneohm/api-contracts';
import { documents } from '@oneohm/database';
import {
  AUDIO_FILE_TYPES,
  type DetectedFileType,
  isAudioType,
  PHOTO_FILE_TYPES,
  VIDEO_FILE_TYPES,
  VOICE_NOTE_CATEGORY,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { forbidden, invalid, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { storageScope } from '../documents/document-links';
import { presentDocuments } from '../documents/document-read';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { recordPhotoGeotag } from '../site-activity/photo-geotag';
import { ServiceVisitsService } from './service-visits.service';

/** Photos, short videos and voice notes: what a service visit records. No papers. */
export const SERVICE_FILE_TYPES: readonly DetectedFileType[] = [
  ...PHOTO_FILE_TYPES,
  ...AUDIO_FILE_TYPES,
  ...VIDEO_FILE_TYPES,
];

const fieldsSchema = z.object({
  name: z.string().trim().max(160).optional(),
  ...geotagFieldsSchema.shape,
});

/**
 * Evidence from a service visit (PRD 5.5, 4.2). Filed with the request, its project and
 * customer: photos and videos as site photos, voice notes apart. Neither shows in the
 * customer app; a photo or video keeps where it was taken, with consent only.
 */
@Injectable()
export class ServiceFilesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly visits: ServiceVisitsService,
  ) {}

  async add(
    actor: Actor,
    id: string,
    file: IncomingFile | undefined,
    raw: unknown,
  ): Promise<DocumentRecord> {
    const parsed = fieldsSchema.safeParse(raw ?? {});
    if (!parsed.success) throw invalid('Some details need fixing.', { file: 'Unreadable.' });
    // Late uploads still land: the queue on the phone may deliver after the work is done.
    const job = await this.visits.load(actor, id);
    if (job.assigneeUserId !== actor.userId)
      throw forbidden('Only the person this request is given to can add files to it.');
    const checked = checkFile(file, SERVICE_FILE_TYPES, parsed.data.name);
    const links = {
      projectId: job.ticket.project?.id ?? null,
      customerId: job.ticket.customer.id,
    };
    const storageKey = `${storageScope(links)}/service/${id}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const category = isAudioType(checked.contentType) ? VOICE_NOTE_CATEGORY : 'site_photo';
    const documentId = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          ...links,
          propertyId: job.place?.id ?? null,
          serviceRequestId: id,
          category,
          source: 'upload',
          checkedAt: new Date(),
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: documents.id });
      if (!row) throw new Error('Document insert returned nothing');
      await recordPhotoGeotag(tx, {
        documentId: row.id,
        userId: actor.userId,
        propertyId: job.place?.id ?? null,
        contentType: checked.contentType,
        fields: parsed.data,
      });
      await recordAudit(tx, actor.userId, 'document.uploaded', 'document', row.id, {
        name: checked.name,
        category,
        serviceRequestId: id,
      });
      return row.id;
    });
    const [record] = await presentDocuments(this.db, eq(documents.id, documentId));
    if (!record) throw notFound('That document');
    return record;
  }
}
