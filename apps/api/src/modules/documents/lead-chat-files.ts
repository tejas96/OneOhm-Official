import { randomUUID } from 'node:crypto';
import { type DatabaseExecutor, documents } from '@oneohm/database';
import { safeFileName } from '@oneohm/domain';
import { logLead } from '../crm/lead-history';
import type { ObjectStorageService } from './object-storage.service';

export interface LeadChatFile {
  readonly leadId: string;
  readonly category: 'electricity_bill';
  readonly fileName: string;
  readonly contentType: string;
  readonly buffer: Buffer;
}

/**
 * Files a paper a customer sent on WhatsApp on their lead, with no signed-in person. It
 * is kept on the lead only (no customer yet) and shows wherever the lead's papers are
 * listed. The caller has already checked the file's type and size. Returns the document id.
 */
export async function storeLeadDocument(
  tx: DatabaseExecutor,
  storage: Pick<ObjectStorageService, 'put'>,
  input: LeadChatFile,
): Promise<string> {
  const storageKey = `leads/${input.leadId}/${randomUUID()}/${safeFileName(input.fileName)}`;
  await storage.put(storageKey, input.buffer, input.contentType);
  const [row] = await tx
    .insert(documents)
    .values({
      leadId: input.leadId,
      customerId: null,
      category: input.category,
      source: 'upload',
      name: input.fileName,
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.buffer.length,
      uploadedByUserId: null,
    })
    .returning({ id: documents.id });
  if (!row) throw new Error('Document insert returned nothing');
  await logLead(tx, input.leadId, null, 'whatsapp', 'Electricity bill received on WhatsApp');
  return row.id;
}
