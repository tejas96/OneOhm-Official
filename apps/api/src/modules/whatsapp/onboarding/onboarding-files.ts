import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DatabaseExecutor } from '@oneohm/database';
import { AppError } from '../../../common/http/errors';
import { logLead } from '../../crm/lead-history';
import { storeLeadDocument } from '../../documents/lead-chat-files';
import { ObjectStorageService } from '../../documents/object-storage.service';
import { checkFile, type IncomingFile } from '../../documents/upload-file';
import { MEDIA_WORDS } from '../assistant/words';
import { type MediaGateway, MediaTooLargeError, WHATSAPP_MEDIA } from '../media-gateway';
import type { IncomingMedia } from '../whatsapp-events';
import { ONBOARD_WORDS } from './onboard-words';

/** A bill sent before the lead exists: already in object storage, named in `ob.pendingFile`. */
export interface PendingFile {
  readonly storageKey: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly size: number;
}

export type Fetched = IncomingFile | 'too_large' | 'failed';

/** What became of a file the customer sent. A file is never an unclear answer. */
export type FileOutcome = 'filed' | 'held' | 'unreadable' | 'too_large' | 'failed' | 'bad';

export interface FileResult {
  readonly outcome: FileOutcome;
  /** The file now waiting for the lead (only when the outcome is `held`). */
  readonly pending?: PendingFile;
  /** Pending objects to remove once the caller's transaction has committed. */
  readonly discard: readonly string[];
}

/** The reply for an outcome, in the language being spoken (call it inside the language scope). */
export function fileWords(outcome: FileOutcome): string {
  switch (outcome) {
    case 'filed':
      return ONBOARD_WORDS.billThanks;
    case 'held':
      return ONBOARD_WORDS.firstDetails;
    case 'unreadable':
      return ONBOARD_WORDS.notRead;
    case 'too_large':
      return MEDIA_WORDS.tooLarge;
    case 'failed':
      return MEDIA_WORDS.failed;
    case 'bad':
      return ONBOARD_WORDS.badFile;
  }
}

/**
 * The electricity bill a new WhatsApp number sends: downloaded from WhatsApp, filed on
 * the lead when there is one, or held in object storage until the lead is made.
 */
@Injectable()
export class ChatFilesService {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(WHATSAPP_MEDIA) private readonly gateway: MediaGateway,
    private readonly storage: ObjectStorageService,
  ) {}

  /** The photo or paper, fetched from WhatsApp; null for no file, a voice note or a video. */
  async download(media: IncomingMedia | null | undefined): Promise<Fetched | null> {
    if (!media || media.type === 'audio' || media.type === 'video') return null;
    try {
      const file = await this.gateway.download(media);
      return { originalname: file.fileName, size: file.buffer.length, buffer: file.buffer };
    } catch (error) {
      this.log.warn(`WhatsApp media ${media.id} not downloaded: ${String(error)}`);
      return error instanceof MediaTooLargeError ? 'too_large' : 'failed';
    }
  }

  /**
   * Files the download on the lead, or (no lead yet) holds it for the lead. Any failure is
   * an outcome to tell the customer about; it never throws and never aborts the caller's
   * transaction (the document insert runs in a savepoint).
   */
  async receive(
    tx: DatabaseExecutor,
    file: Fetched | null,
    chat: {
      readonly id: string;
      readonly leadId: string | null;
      readonly pending?: PendingFile | undefined;
    },
  ): Promise<FileResult> {
    if (file === null) return { outcome: 'unreadable', discard: [] };
    if (typeof file === 'string') return { outcome: file, discard: [] };
    try {
      if (chat.leadId) {
        await this.fileOnLead(tx, chat.leadId, file.originalname, file.buffer);
        return { outcome: 'filed', discard: [] };
      }
      const pending = await this.hold(chat.id, file);
      return { outcome: 'held', pending, discard: chat.pending ? [chat.pending.storageKey] : [] };
    } catch (error) {
      this.log.warn(`Chat file not kept: ${String(error)}`);
      return { outcome: error instanceof AppError ? 'bad' : 'failed', discard: [] };
    }
  }

  /**
   * Files a bill held before the lead existed onto the lead, in the caller's transaction.
   * Called when the lead is made (the city answer) and by the stalled-chat lead creation.
   * Returns false, with a note on the lead, when it cannot be filed. The held object stays
   * until the caller commits and then passes its key to `discard`.
   */
  async filePendingBill(
    tx: DatabaseExecutor,
    leadId: string,
    pending: PendingFile,
  ): Promise<boolean> {
    try {
      const buffer = await this.storage.getBuffer(pending.storageKey);
      await this.fileOnLead(tx, leadId, pending.fileName, buffer);
      return true;
    } catch (error) {
      this.log.warn(`Held bill ${pending.storageKey} not filed: ${String(error)}`);
      await logLead(tx, leadId, null, 'whatsapp', 'A bill photo was sent but could not be filed');
      return false;
    }
  }

  /** Removes held objects (best effort) once the transaction that dropped them committed. */
  async discard(keys: readonly string[]): Promise<void> {
    for (const key of keys)
      await this.storage
        .remove(key)
        .catch((error) => this.log.warn(`Held bill ${key} not removed: ${String(error)}`));
  }

  private fileOnLead(tx: DatabaseExecutor, leadId: string, fileName: string, buffer: Buffer) {
    return tx.transaction((savepoint) =>
      storeLeadDocument(savepoint, this.storage, {
        leadId,
        category: 'electricity_bill',
        fileName,
        buffer,
      }),
    );
  }

  private async hold(chatId: string, file: IncomingFile): Promise<PendingFile> {
    const checked = checkFile(file, undefined, undefined);
    const storageKey = `pending/${chatId}/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    return {
      storageKey,
      fileName: checked.name,
      contentType: checked.contentType,
      size: checked.buffer.length,
    };
  }
}
