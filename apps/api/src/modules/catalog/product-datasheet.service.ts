import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Product } from '@oneohm/api-contracts';
import { documents, products } from '@oneohm/database';
import { ACCEPTED_FILE_TYPES } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../documents/upload-file';
import { DATASHEET_CATEGORY, productViews } from './product-view';

/**
 * The maker's datasheet on a product (PRD 3.5 product specifications). A new upload
 * replaces the old one, which is kept and marked replaced for the audit trail.
 */
@Injectable()
export class ProductDatasheetService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async upload(actor: Actor, productId: string, file: IncomingFile | undefined): Promise<Product> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) throw notFound('That product');
    const checked = checkFile(file, ACCEPTED_FILE_TYPES);
    const storageKey = `catalog/${productId}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const updated = await this.db.transaction(async (tx) => {
      const previous = product.datasheetDocumentId;
      if (previous) {
        await tx
          .update(documents)
          .set({ replacedAt: new Date(), replacedByUserId: actor.userId })
          .where(eq(documents.id, previous));
      }
      const [document] = await tx
        .insert(documents)
        .values({
          category: DATASHEET_CATEGORY,
          source: 'upload',
          checkedAt: new Date(),
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
          replacesDocumentId: previous,
          uploadedByUserId: actor.userId,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing.');
      const [row] = await tx
        .update(products)
        .set({ datasheetDocumentId: document.id, updatedAt: new Date() })
        .where(eq(products.id, productId))
        .returning();
      await recordAudit(tx, actor.userId, 'product.datasheet_uploaded', 'product', productId, {
        documentId: document.id,
        replaced: previous,
      });
      return row;
    });
    if (!updated) throw notFound('That product');
    const [view] = await productViews(this.db, [updated]);
    if (!view) throw notFound('That product');
    return view;
  }
}
