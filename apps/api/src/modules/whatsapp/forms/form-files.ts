import { Inject, Injectable, Logger } from '@nestjs/common';
import { documents, waMessages } from '@oneohm/database';
import { WHATSAPP_FILE_TYPES } from '@oneohm/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { ObjectStorageService } from '../../documents/object-storage.service';
import { checkFile } from '../../documents/upload-file';
import { keptFile, whatsappFileScope } from '../chat-files-kept';
import { tellChatTeam } from '../chat-owner';
import type { Conversation } from '../chat-store';
import { type MediaGateway, MediaTooLargeError, WHATSAPP_MEDIA } from '../media-gateway';
import type { FormFile } from './form-reply-data';
import { decryptFormMedia, MediaTamperedError } from './media-decrypt';

/** Why a form file was not kept; the customer is told this, once per reason. */
export type FormRefusal = 'too_large' | 'wrong_type' | 'empty' | 'tampered' | 'failed';

export type KeptFormFile =
  | { readonly ok: true; readonly id: string; readonly contentType: string; readonly media: string }
  | { readonly ok: false; readonly why: FormRefusal };

/**
 * Stores the files of a form reply once each, through the same document path as files sent
 * in the chat (type by bytes, size caps, empty), under the customer with no home yet. A file
 * that fails is refused with its true reason and the team is alerted; it never throws for a
 * bad file, so the others are still kept.
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
      const scope = whatsappFileScope(customerId, file.id);
      const [earlier] = await this.db
        .select({ id: documents.id, contentType: documents.contentType })
        .from(documents)
        .where(
          and(
            eq(documents.customerId, customerId),
            sql`starts_with(${documents.storageKey}, ${scope})`,
            isNull(documents.removedAt),
          ),
        )
        .limit(1);
      if (earlier)
        return { ok: true, id: earlier.id, contentType: earlier.contentType, media: file.id };
      const got = await this.fetch(file);
      const checked = checkFile(
        { originalname: got.fileName, size: got.buffer.length, buffer: got.buffer },
        WHATSAPP_FILE_TYPES,
      );
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

  /** The bytes of one form file: a media id downloads as any chat file; a CDN file is decrypted. */
  private async fetch(file: FormFile): Promise<{ buffer: Buffer; fileName: string }> {
    if (file.kind === 'cdn') {
      const buffer = decryptFormMedia(await this.gateway.fetchCdn(file.url), file.meta);
      return { buffer, fileName: file.fileName ?? 'WhatsApp form file' };
    }
    return this.gateway.download({
      type: file.mimeType?.startsWith('image/') ? 'image' : 'document',
      id: file.id,
      mimeType: file.mimeType,
      fileName: file.fileName,
    });
  }

  /** The files show in the chat like files sent there, so the team sees them and [Change] finds them. */
  async showInChat(chat: Conversation, kept: ReadonlyArray<{ id: string; media: string }>) {
    for (const file of kept)
      await this.db.insert(waMessages).values({
        conversationId: chat.id,
        direction: 'in',
        kind: 'media',
        body: '(form file)',
        mediaId: file.media,
        documentId: file.id,
      });
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

const REASON: Record<FormRefusal, string> = {
  too_large: 'too big',
  wrong_type: 'not a photo or PDF',
  empty: 'empty',
  tampered: "it failed WhatsApp's security check",
  failed: 'download failed',
};

function refusalOf(error: unknown): FormRefusal {
  if (error instanceof MediaTamperedError) return 'tampered';
  if (error instanceof MediaTooLargeError) return 'too_large';
  if (!(error instanceof AppError)) return 'failed';
  const why = error.fieldErrors?.file;
  return why === 'Too large.' ? 'too_large' : why === 'Required.' ? 'empty' : 'wrong_type';
}
