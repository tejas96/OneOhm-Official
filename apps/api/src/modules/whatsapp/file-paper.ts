import { type DatabaseExecutor, documents, projectActivities } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import type { IncomingMedia } from './whatsapp-events';

/** How a file is named in the team's alerts and the project log. */
export const FILE_WORDS: Readonly<Record<IncomingMedia['type'], string>> = {
  image: 'a photo',
  document: 'a document',
  video: 'a video',
  audio: 'a voice note',
};

/** The words for a stored file, from its real type. */
export function fileWordsOf(contentType: string): string {
  if (contentType.startsWith('image/')) return FILE_WORDS.image;
  if (contentType.startsWith('audio/')) return FILE_WORDS.audio;
  if (contentType.startsWith('video/')) return FILE_WORDS.video;
  return FILE_WORDS.document;
}

/** Where a stored WhatsApp file is filed: its home, its kind, and the problem it shows. */
export interface PaperPlace {
  readonly projectId: string | null;
  readonly propertyId: string | null;
  readonly category: string;
  readonly serviceRequestId?: string;
}

/**
 * Files a WhatsApp file that is already stored (see `ChatFileKeeper`): only where the
 * same document is kept changes, so there is never a second copy. A file that newly
 * reaches a project is written in that project's log.
 */
export async function filePaper(
  tx: DatabaseExecutor,
  documentId: string,
  to: PaperPlace,
): Promise<void> {
  const [before] = await tx
    .select({
      projectId: documents.projectId,
      name: documents.name,
      contentType: documents.contentType,
    })
    .from(documents)
    .where(eq(documents.id, documentId));
  if (!before) throw new Error(`Document ${documentId} not found.`);
  await tx
    .update(documents)
    .set({
      projectId: to.projectId,
      propertyId: to.propertyId,
      category: to.category,
      // Said where it goes (or that it stays as Other): no longer "to sort".
      sortedAt: new Date(),
      ...(to.serviceRequestId ? { serviceRequestId: to.serviceRequestId } : {}),
    })
    .where(eq(documents.id, documentId));
  if (to.projectId && to.projectId !== before.projectId)
    await tx.insert(projectActivities).values({
      projectId: to.projectId,
      kind: 'whatsapp_file',
      message: `Customer sent ${fileWordsOf(before.contentType)} on WhatsApp: ${before.name}`,
      data: { documentId },
    });
}
