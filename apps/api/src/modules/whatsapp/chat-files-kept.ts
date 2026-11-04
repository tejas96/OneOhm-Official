import { customerActions, type DatabaseExecutor, documents } from '@oneohm/database';
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
 * Whether a kept file is left "to sort": no home chosen, or a voice note or video on the
 * person row (kept as Other, which no home or person paper holds).
 */
export function leftToSort(
  place: { readonly propertyId: string | null } | null,
  sound: boolean,
): boolean {
  return !place || (sound && !place.propertyId);
}

/** The storage folder of a customer's WhatsApp file; only letters, digits, `_` and `-` of the media id stay (no dots, so no `..`). */
export function whatsappFileScope(customerId: string, mediaId: string): string {
  return `customers/${customerId}/whatsapp/${mediaId.replace(/[^\w-]/g, '_')}/`;
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

/**
 * Filed already: on a home, on a problem, as an ID paper (the person row), or as the
 * answer to a paper request.
 */
export async function isFiled(db: DatabaseExecutor, documentId: string): Promise<boolean> {
  const [document] = await db
    .select({
      projectId: documents.projectId,
      propertyId: documents.propertyId,
      serviceRequestId: documents.serviceRequestId,
      category: documents.category,
      sortedAt: documents.sortedAt,
    })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!document || document.projectId || document.propertyId || document.serviceRequestId)
    return true;
  if (document.category !== 'other' || document.sortedAt) return true;
  const [answer] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(eq(customerActions.documentId, documentId))
    .limit(1);
  return Boolean(answer);
}

/** True for a file that answered a request or shows a problem: those flows tell their own people. */
export async function answersSomething(db: DatabaseExecutor, documentId: string): Promise<boolean> {
  const [document] = await db
    .select({ serviceRequestId: documents.serviceRequestId })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!document || document.serviceRequestId) return true;
  const [answer] = await db
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(eq(customerActions.documentId, documentId))
    .limit(1);
  return Boolean(answer);
}
