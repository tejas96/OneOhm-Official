import { type DatabaseExecutor, documentRequests, documents } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { Database } from '../../config/core.module';
import type { ObjectStorageService } from '../documents/object-storage.service';
import type { CheckedFile } from '../documents/upload-file';
import { linkChatFile } from './chat-store';

/** Who a kept WhatsApp file belongs to, and what else happens with it in the same step. */
interface KeptFor {
  readonly customerId?: string;
  readonly leadId?: string;
  readonly alsoDo?: (tx: DatabaseExecutor, documentId: string) => Promise<unknown>;
}

/**
 * Stores a WhatsApp file once under Documents (category `other`, no home yet) and shows it
 * on its chat message. The stored bytes are taken back if the row cannot be written.
 */
export async function keptFile(
  db: Database,
  storage: ObjectStorageService,
  mediaId: string,
  storageKey: string,
  checked: CheckedFile,
  owner: KeptFor,
): Promise<string> {
  await storage.put(storageKey, checked.buffer, checked.contentType);
  try {
    return await db.transaction(async (tx) => {
      const [document] = await tx
        .insert(documents)
        .values({
          customerId: owner.customerId ?? null,
          leadId: owner.leadId ?? null,
          projectId: null,
          propertyId: null,
          category: 'other',
          source: 'upload',
          name: checked.name,
          storageKey,
          contentType: checked.contentType,
          sizeBytes: checked.buffer.length,
        })
        .returning({ id: documents.id });
      if (!document) throw new Error('Document insert returned nothing');
      await linkChatFile(tx, mediaId, document.id);
      await owner.alsoDo?.(tx, document.id);
      return document.id;
    });
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}

/** Filed already: on a home, on a problem, or as the answer to a paper request. */
export async function isFiled(db: DatabaseExecutor, documentId: string): Promise<boolean> {
  const [document] = await db
    .select({ projectId: documents.projectId, serviceRequestId: documents.serviceRequestId })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!document || document.projectId || document.serviceRequestId) return true;
  const [answer] = await db
    .select({ id: documentRequests.id })
    .from(documentRequests)
    .where(eq(documentRequests.documentId, documentId))
    .limit(1);
  return Boolean(answer);
}
