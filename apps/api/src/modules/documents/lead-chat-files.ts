import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor, documents } from '@oneohm/database';
import { logLead } from '../crm/lead-history';
import type { ObjectStorageService } from './object-storage.service';
import { checkFile } from './upload-file';

export interface LeadChatFile {
  readonly leadId: string;
  readonly category: 'electricity_bill';
  readonly fileName: string;
  readonly buffer: Buffer;
}

/**
 * Files a paper a customer sent on WhatsApp on their lead, with no signed-in person. It
 * is kept on the lead only (no customer yet) and shows on the lead's papers. The file is
 * checked like any upload (real type from its bytes, size cap); a bad one is refused with
 * the same error. If the record cannot be saved the stored object is removed (best
 * effort), but a later rollback of the caller's transaction can still orphan the object.
 * Returns the document id.
 */
export async function storeLeadDocument(
  tx: DatabaseExecutor,
  storage: Pick<ObjectStorageService, 'put' | 'remove'>,
  input: LeadChatFile,
): Promise<string> {
  const checked = checkFile(
    { originalname: input.fileName, size: input.buffer.length, buffer: input.buffer },
    undefined,
    undefined,
  );
  const storageKey = `leads/${input.leadId}/${randomUUID()}/${checked.keyName}`;
  await storage.put(storageKey, checked.buffer, checked.contentType);
  try {
    const [row] = await tx
      .insert(documents)
      .values({
        leadId: input.leadId,
        customerId: null,
        category: input.category,
        source: 'upload',
        name: checked.name,
        storageKey,
        contentType: checked.contentType,
        sizeBytes: checked.buffer.length,
        uploadedByUserId: null,
      })
      .returning({ id: documents.id });
    if (!row) throw new Error('Document insert returned nothing');
    await logLead(
      tx,
      input.leadId,
      null,
      'whatsapp',
      'Bill file received on WhatsApp (not checked)',
    );
    return row.id;
  } catch (error) {
    await storage.remove(storageKey).catch(() => undefined);
    throw error;
  }
}
