import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { MaterialSlip } from '@oneohm/api-contracts';
import { documents, materialSlips, projects } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { CustodyService } from './custody.service';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;

/**
 * A photo of material handed over or brought back, filed with the project's documents
 * as a site photo (not shown to the customer: it belongs to no customer-facing task).
 */
@Injectable()
export class CustodyPhotoService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
    private readonly custody: CustodyService,
  ) {}

  async attach(
    actor: Actor,
    slipId: string,
    file: IncomingFile | undefined,
  ): Promise<MaterialSlip> {
    const [row] = await this.db
      .select({
        slip: materialSlips,
        customerId: projects.customerId,
        propertyId: projects.propertyId,
      })
      .from(materialSlips)
      .innerJoin(projects, eq(projects.id, materialSlips.projectId))
      .where(eq(materialSlips.id, slipId));
    if (!row) throw notFound('That material slip');
    const { slip } = row;
    if (!can(actor, 'inventory.manage') && slip.recordedByUserId !== actor.userId)
      throw forbidden('Only the store or the person who recorded this slip can add its photo.');
    const checked = checkFile(file, PHOTO_TYPES, `Material ${slip.number.replaceAll('/', '-')}`);
    const storageKey = `projects/${slip.projectId}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    await this.db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          projectId: slip.projectId,
          customerId: row.customerId,
          propertyId: row.propertyId,
          category: 'site_photo',
          source: 'upload',
          checkedAt: new Date(),
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing.');
      await tx
        .update(materialSlips)
        .set({ photoDocumentId: document.id })
        .where(eq(materialSlips.id, slip.id));
      await recordAudit(tx, actor.userId, 'material.photo_added', 'material_slip', slip.id, {
        documentId: document.id,
      });
    });
    return this.custody.slip(slip.id);
  }
}
