import { Inject, Injectable, Logger } from '@nestjs/common';
import { documents, projectTasks } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { forbidden, notFound } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { canViewDocument } from './document-access';
import { ObjectStorageService, type StoredObject } from './object-storage.service';
import { canThumbnail, makeThumbnail, THUMBNAIL_TYPE, thumbnailKeyOf } from './thumbnail-image';

type DocumentRow = typeof documents.$inferSelect;

/**
 * A photo's small preview for galleries and tiles. Photos get it when stored; older
 * uploads get it on their first view (the backfill), and the key is kept on the row.
 * Anything that cannot have one (HEIC, PDFs, a damaged photo) is sent as it is.
 */
@Injectable()
export class DocumentThumbnailsService {
  private readonly logger = new Logger(DocumentThumbnailsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly storage: ObjectStorageService,
  ) {}

  async thumbnail(actor: Actor, id: string): Promise<StoredObject & { type: string }> {
    const row = await this.viewable(actor, id);
    const key = await this.ensure(row);
    if (key === row.storageKey) {
      return { ...(await this.storage.get(row.storageKey)), type: row.contentType };
    }
    return { ...(await this.storage.get(key)), type: THUMBNAIL_TYPE };
  }

  /** The preview's key, made now when missing; the original's key when there is none. */
  private async ensure(row: DocumentRow): Promise<string> {
    // Only a key made for this very file counts: a replacement copies the old row.
    const own = [thumbnailKeyOf(row.storageKey), row.storageKey];
    if (row.thumbnailKey && own.includes(row.thumbnailKey)) return row.thumbnailKey;
    if (!canThumbnail(row.contentType)) return row.storageKey;
    let kept = thumbnailKeyOf(row.storageKey);
    if (!(await this.storage.exists(kept))) {
      const original = await this.storage.getBuffer(row.storageKey);
      const preview = await makeThumbnail(original).catch((error: unknown) => {
        this.logger.warn(`No preview for document ${row.id}: ${String(error)}`);
        return null;
      });
      // Not readable as a photo: remember that, and show the original from now on.
      if (preview) await this.storage.put(kept, preview, THUMBNAIL_TYPE);
      else kept = row.storageKey;
    }
    await this.db.update(documents).set({ thumbnailKey: kept }).where(eq(documents.id, row.id));
    return kept;
  }

  /** The same rule as opening the file: the office, the uploader or the task's assignee. */
  private async viewable(actor: Actor, id: string): Promise<DocumentRow> {
    const [row] = await this.db.select().from(documents).where(eq(documents.id, id)).limit(1);
    if (!row) throw notFound('That document');
    const [task] = row.taskId
      ? await this.db
          .select({ assignee: projectTasks.assigneeUserId, status: projectTasks.status })
          .from(projectTasks)
          .where(eq(projectTasks.id, row.taskId))
          .limit(1)
      : [];
    const links = {
      uploadedByUserId: row.uploadedByUserId,
      category: row.category,
      taskAssigneeId: task?.assignee ?? null,
      taskCompleted: task?.status === 'completed',
    };
    if (!canViewDocument(actor, links)) throw forbidden();
    return row;
  }
}
