import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type DatabaseExecutor, waMessages } from '@oneohm/database';
import { WHATSAPP_FILE_TYPES } from '@oneohm/domain';
import { and, eq, isNotNull } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { ObjectStorageService } from '../../documents/object-storage.service';
import { checkFile } from '../../documents/upload-file';
import { keptFile, storedBefore, whatsappFileScope } from '../chat-files-kept';
import { tellChatTeam } from '../chat-owner';
import type { Conversation } from '../chat-store';
import { type MediaGateway, MediaTooLargeError, WHATSAPP_MEDIA } from '../media-gateway';
import type { FormFile } from './form-reply-data';

/** Why a form file was not kept; the customer is told this, once per reason. */
export type FormRefusal = 'too_large' | 'wrong_type' | 'empty' | 'changed' | 'failed';

export type KeptFormFile =
  | { readonly ok: true; readonly id: string; readonly contentType: string; readonly media: string }
  | { readonly ok: false; readonly why: FormRefusal };

/** The bytes are not the file WhatsApp described (its SHA-256 differs). */
class ChangedFileError extends Error {}

/** WhatsApp gives the hash as base64 (hex is accepted too). */
function sameHash(bytes: Buffer, expected: string): boolean {
  const raw = createHash('sha256').update(bytes).digest();
  return raw.toString('base64') === expected || raw.toString('hex') === expected.toLowerCase();
}

/**
 * Stores the files of a form reply once each, through the same document path as files sent
 * in the chat (type by bytes, size caps, empty), under the customer with no home yet. WhatsApp's
 * SHA-256 is checked against the downloaded bytes. A file that fails is refused with its true
 * reason and the team is alerted; it never throws for a bad file, so the others are still kept.
 */
@Injectable()
export class FormFileKeeper {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(WHATSAPP_MEDIA) private readonly gateway: MediaGateway,
    private readonly storage: ObjectStorageService,
  ) {}

  async keep(chat: Conversation, customerId: string, file: FormFile): Promise<KeptFormFile> {
    try {
      const earlier = await storedBefore(this.db, customerId, file.id);
      if (earlier) return { ok: true, ...earlier, media: file.id };
      const got = await this.gateway.download({
        type: file.mimeType?.startsWith('image/') ? 'image' : 'document',
        id: file.id,
        mimeType: file.mimeType,
        fileName: file.fileName,
      });
      if (file.sha256 && !sameHash(got.buffer, file.sha256))
        throw new ChangedFileError('The file does not match its SHA-256.');
      const checked = checkFile(
        { originalname: got.fileName, size: got.buffer.length, buffer: got.buffer },
        WHATSAPP_FILE_TYPES,
      );
      const scope = whatsappFileScope(customerId, file.id);
      const id = await keptFile(
        this.db,
        this.storage,
        file.id,
        `${scope}${checked.keyName}`,
        checked,
        {
          customerId,
        },
      );
      return { ok: true, id, contentType: checked.contentType, media: file.id };
    } catch (error) {
      const why = refusalOf(error);
      this.log.warn(`Form file ${file.id} refused (${why}): ${String(error)}`);
      await this.tellLost(chat, file.id, why).catch((alert) =>
        this.log.error(`Could not alert about form file ${file.id}: ${String(alert)}`),
      );
      return { ok: false, why };
    }
  }

  private tellLost(chat: Conversation, fileId: string, why: FormRefusal) {
    return tellChatTeam(this.db, chat, {
      kind: 'whatsapp_file_failed',
      title: 'WhatsApp file not saved',
      body: `${chat.profileName ?? chat.phone} sent a file in a form, but it could not be saved (${REASON[why]}). Ask them to send it again.`,
      key: `wa_form_lost:${chat.id}:${fileId}`,
    });
  }
}

/**
 * The files show in the chat like files sent there, so the team sees them and [Change] finds
 * them. Run inside the filing transaction; a file already shown (a retry) is not shown twice.
 */
export async function showFormFiles(
  tx: DatabaseExecutor,
  chatId: string,
  kept: ReadonlyArray<{ id: string; media: string }>,
): Promise<void> {
  for (const file of kept) {
    const [shown] = await tx
      .select({ id: waMessages.id })
      .from(waMessages)
      .where(
        and(
          eq(waMessages.conversationId, chatId),
          eq(waMessages.documentId, file.id),
          isNotNull(waMessages.documentId),
        ),
      )
      .limit(1);
    if (shown) continue;
    await tx.insert(waMessages).values({
      conversationId: chatId,
      direction: 'in',
      kind: 'media',
      body: '(form file)',
      mediaId: file.media,
      documentId: file.id,
    });
  }
}

const REASON: Record<FormRefusal, string> = {
  too_large: 'too big',
  wrong_type: 'not a photo or PDF',
  empty: 'empty',
  changed: "it did not match WhatsApp's checksum",
  failed: 'download failed',
};

function refusalOf(error: unknown): FormRefusal {
  if (error instanceof ChangedFileError) return 'changed';
  if (error instanceof MediaTooLargeError) return 'too_large';
  if (!(error instanceof AppError)) return 'failed';
  const why = error.fieldErrors?.file;
  return why === 'Too large.' ? 'too_large' : why === 'Required.' ? 'empty' : 'wrong_type';
}
