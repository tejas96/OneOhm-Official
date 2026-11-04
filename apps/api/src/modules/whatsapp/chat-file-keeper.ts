import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type DatabaseExecutor, documents, leads, waMessages } from '@oneohm/database';
import { WHATSAPP_FILE_TYPES } from '@oneohm/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { logLead } from '../crm/lead-history';
import { customerHomes } from '../customer-portal/customer-homes';
import { ObjectStorageService } from '../documents/object-storage.service';
import { type CheckedFile, checkFile } from '../documents/upload-file';
import { placeOn } from './assistant/kept-files';
import {
  answersSomething,
  isFiled,
  keptFile,
  leftToSort,
  whatsappFileScope,
} from './chat-files-kept';
import { tellChatTeam } from './chat-owner';
import { type Conversation, linkChatFile } from './chat-store';
import { FILE_WORDS, filePaper } from './file-paper';
import { type MediaGateway, MediaTooLargeError, WHATSAPP_MEDIA } from './media-gateway';
import type { Incoming, IncomingMedia } from './whatsapp-events';

/**
 * Every file a customer sends on WhatsApp is stored once, here. A customer's file is kept
 * the moment it arrives, before the assistant answers, under the customer with no home
 * yet; the assistant then only files that same document (an asked-for paper, a problem
 * photo). Whatever no flow filed is put on its home after the answer, or left to sort
 * (`settle`). A lead's file is kept after the answer on their lead, unless onboarding
 * filed it. It never throws: a failure is logged and the team is told, so no file goes silent.
 */
@Injectable()
export class ChatFileKeeper {
  private readonly log = new Logger('WhatsApp');
  /** Files just refused, so the assistant can tell the customer why (said once, and true). */
  private readonly refused = new Map<string, 'too_large' | 'wrong_type'>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(WHATSAPP_MEDIA) private readonly gateway: MediaGateway,
    private readonly storage: ObjectStorageService,
  ) {}

  /** Stores the message's file; its document id, or null when it was not kept. */
  async keep(chat: Conversation, message: Incoming): Promise<string | null> {
    const media = message.media;
    if (!media) return null;
    try {
      const [row] = await this.db
        .select({ documentId: waMessages.documentId })
        .from(waMessages)
        .where(eq(waMessages.waMessageId, message.waMessageId));
      // Already kept (or filed by onboarding): nothing to do.
      if (!row || row.documentId) return row?.documentId ?? null;
      return chat.customerId
        ? await this.storeForCustomer(chat, message, media, chat.customerId)
        : await this.fileOnLead(chat, message, media);
    } catch (error) {
      this.log.error(`WhatsApp file ${media.id} not kept: ${String(error)}`);
      await this.tellLost(chat, message, media).catch((alert) =>
        this.log.error(`Could not alert about lost file ${media.id}: ${String(alert)}`),
      );
      return null;
    }
  }

  /** Why `keep` refused this file (once): too big, or a kind we cannot open; null if neither. */
  refusalFor(mediaId: string): 'too_large' | 'wrong_type' | null {
    const why = this.refused.get(mediaId) ?? null;
    this.refused.delete(mediaId);
    return why;
  }

  /**
   * After the assistant answered: a customer's file no flow filed goes on its home when
   * that needs no question (`homeForFile`); else it stays "To sort" under the customer.
   * Either way, and for a file the assistant filed without answering a request, the
   * chat's person hears once. Never throws.
   */
  async settle(chat: Conversation, message: Incoming): Promise<void> {
    const media = message.media;
    if (!media || !chat.customerId) return;
    try {
      const [row] = await this.db
        .select({ documentId: waMessages.documentId })
        .from(waMessages)
        .where(eq(waMessages.waMessageId, message.waMessageId));
      const documentId = row?.documentId;
      // An answered paper or a problem photo: the asker or the complaint's people hear.
      if (!documentId || (await answersSomething(this.db, documentId))) return;
      // Filed by the assistant already (saved on its home, or waiting on "Which paper?").
      if (await isFiled(this.db, documentId))
        return await this.tellKept(this.db, chat, message, media);
      // A photo or paper waits for "What is this?" (asked a moment after the last file); only
      // a voice note or video goes on the customer's one home, since nothing asks about it.
      const sound = media.type === 'audio' || media.type === 'video';
      const homes = sound ? await customerHomes(this.db, chat.customerId) : [];
      const [only] = homes;
      const place = homes.length === 1 && only ? placeOn(homes, only.propertyId, 'other') : null;
      await this.db.transaction(async (tx) => {
        if (place) await filePaper(tx, documentId, place);
        await this.tellKept(tx, chat, message, media, leftToSort(place, sound));
      });
    } catch (error) {
      this.log.error(`WhatsApp file ${media.id} not filed: ${String(error)}`);
      await tellChatTeam(this.db, chat, {
        kind: 'whatsapp_file_failed',
        title: 'WhatsApp file not filed',
        body: `${chat.profileName ?? chat.phone} sent ${FILE_WORDS[media.type]}. It is in their Documents, but could not be put on their home.`,
        key: `wa_file_unfiled:${message.waMessageId}`,
      }).catch((alert) => this.log.error(`Could not alert about ${media.id}: ${String(alert)}`));
    }
  }

  /** Under the customer, no home yet; Meta's retry of the same file finds it again. */
  private async storeForCustomer(
    chat: Conversation,
    message: Incoming,
    media: IncomingMedia,
    customerId: string,
  ): Promise<string | null> {
    const scope = whatsappFileScope(customerId, media.id);
    const [earlier] = await this.db
      .select({ id: documents.id })
      .from(documents)
      .where(
        and(
          eq(documents.customerId, customerId),
          sql`starts_with(${documents.storageKey}, ${scope})`,
          isNull(documents.removedAt),
        ),
      )
      .limit(1);
    if (earlier) {
      await linkChatFile(this.db, media.id, earlier.id);
      return earlier.id;
    }
    const checked = await this.download(chat, message, media);
    if (!checked) return null;
    return keptFile(this.db, this.storage, media.id, `${scope}${checked.keyName}`, checked, {
      customerId,
    });
  }

  /** A lead's file, on their lead, after the assistant (onboarding files its own bills). */
  private async fileOnLead(chat: Conversation, message: Incoming, media: IncomingMedia) {
    const [lead] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.phoneE164, chat.phone))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    if (!lead) {
      // A new number with no lead yet: onboarding holds its bill until the lead is made.
      this.log.log(`WhatsApp file ${media.id} from ${chat.phone} waits: no customer or lead.`);
      return null;
    }
    const checked = await this.download(chat, message, media);
    if (!checked) return null;
    const storageKey = `leads/${lead.id}/whatsapp/${randomUUID()}/${checked.keyName}`;
    return keptFile(this.db, this.storage, media.id, storageKey, checked, {
      leadId: lead.id,
      alsoDo: async (tx) => {
        const what = FILE_WORDS[media.type];
        await logLead(tx, lead.id, null, 'whatsapp', `Customer sent ${what} on WhatsApp`);
        await this.tellKept(tx, chat, message, media);
      },
    });
  }

  /** The file from WhatsApp, checked; null (after telling the team) when it is refused. */
  private async download(
    chat: Conversation,
    message: Incoming,
    media: IncomingMedia,
  ): Promise<CheckedFile | null> {
    let download: Awaited<ReturnType<MediaGateway['download']>>;
    try {
      download = await this.gateway.download(media);
    } catch (error) {
      if (error instanceof MediaTooLargeError) {
        this.refuse(media.id, 'too_large');
      }
      throw error;
    }
    try {
      return checkFile(
        { originalname: download.fileName, size: download.buffer.length, buffer: download.buffer },
        WHATSAPP_FILE_TYPES,
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.log.warn(`WhatsApp file ${media.id} refused: ${error.message}`);
      this.refuse(media.id, error.fieldErrors?.file === 'Too large.' ? 'too_large' : 'wrong_type');
      await this.tellLost(chat, message, media, error.message);
      return null;
    }
  }

  private refuse(mediaId: string, why: 'too_large' | 'wrong_type') {
    if (this.refused.size > 100) this.refused.clear();
    this.refused.set(mediaId, why);
  }

  private tellKept(
    tx: DatabaseExecutor,
    chat: Conversation,
    message: Incoming,
    media: IncomingMedia,
    toSort = false,
  ) {
    // A voice note or video already reached a person through the hand-over alert.
    if (chat.state !== 'human' && (media.type === 'audio' || media.type === 'video')) return;
    return tellChatTeam(tx, chat, {
      kind: 'whatsapp_message',
      title: `WhatsApp from ${chat.profileName ?? chat.phone}`,
      body: `Sent ${FILE_WORDS[media.type]}. Saved in Documents${toSort ? ', to sort: no home yet' : ''}.`,
      // The same key as the "customer wrote" alert, so the person hears once.
      key: `wa_in:${message.waMessageId}`,
    });
  }

  private tellLost(chat: Conversation, message: Incoming, media: IncomingMedia, why?: string) {
    return tellChatTeam(this.db, chat, {
      kind: 'whatsapp_file_failed',
      title: `WhatsApp file not saved`,
      body: `${chat.profileName ?? chat.phone} sent ${FILE_WORDS[media.type]}, but it could not be saved${why ? ` (${why})` : ''}. Ask them to send it again.`,
      key: `wa_file_lost:${message.waMessageId}`,
    });
  }
}
