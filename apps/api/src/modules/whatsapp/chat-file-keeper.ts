import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { documents, leads, projectActivities, waMessages } from '@oneohm/database';
import { EVIDENCE_FILE_TYPES } from '@oneohm/domain';
import { desc, eq } from 'drizzle-orm';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database } from '../../config/core.module';
import { logLead } from '../crm/lead-history';
import { activeHomes } from '../customer-portal/active-projects';
import { storageScope } from '../documents/document-links';
import { ObjectStorageService } from '../documents/object-storage.service';
import { checkFile } from '../documents/upload-file';
import { tellChatTeam } from './chat-owner';
import { type Conversation, linkChatFile } from './chat-store';
import { type MediaGateway, WHATSAPP_MEDIA } from './media-gateway';
import type { Incoming, IncomingMedia } from './whatsapp-events';

/** How a file is named in the team's alerts and the project log. */
export const FILE_WORDS: Readonly<Record<IncomingMedia['type'], string>> = {
  image: 'a photo',
  document: 'a document',
  video: 'a video',
  audio: 'a voice note',
};

/**
 * The safety net for files a customer sends on WhatsApp. The assistant files some of them
 * itself (an asked-for paper, a problem photo, a lead's bill). Any file still not filed
 * after the assistant has answered — a voice note, a video, a file sent while a person
 * has the chat — is kept here under Documents, on the customer's newest project or on
 * their lead. The chat message then shows it, the project log says so, and the team hears.
 * It never throws: a failure is logged and the team is told, so no file goes silent.
 */
@Injectable()
export class ChatFileKeeper {
  private readonly log = new Logger('WhatsApp');

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(WHATSAPP_MEDIA) private readonly gateway: MediaGateway,
    private readonly storage: ObjectStorageService,
  ) {}

  async keep(chat: Conversation, message: Incoming): Promise<void> {
    const media = message.media;
    if (!media) return;
    try {
      await this.file(chat, message, media);
    } catch (error) {
      this.log.error(`WhatsApp file ${media.id} not kept: ${String(error)}`);
      await this.tellLost(chat, message, media).catch((alert) =>
        this.log.error(`Could not alert about lost file ${media.id}: ${String(alert)}`),
      );
    }
  }

  private async file(chat: Conversation, message: Incoming, media: IncomingMedia) {
    const [row] = await this.db
      .select({ documentId: waMessages.documentId })
      .from(waMessages)
      .where(eq(waMessages.waMessageId, message.waMessageId));
    // Already filed by the assistant (or by an earlier try): nothing to do.
    if (!row || row.documentId) return;
    const home = await this.homeOf(chat);
    if (!home) {
      // A new number with no lead yet: onboarding holds its bill until the lead is made.
      this.log.log(`WhatsApp file ${media.id} from ${chat.phone} waits: no customer or lead.`);
      return;
    }
    const download = await this.gateway.download(media);
    let checked: ReturnType<typeof checkFile>;
    try {
      checked = checkFile(
        { originalname: download.fileName, size: download.buffer.length, buffer: download.buffer },
        EVIDENCE_FILE_TYPES,
      );
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      this.log.warn(`WhatsApp file ${media.id} refused: ${error.message}`);
      return this.tellLost(chat, message, media, error.message);
    }
    const scope = home.leadId ? `leads/${home.leadId}` : storageScope(home);
    const storageKey = `${scope}/whatsapp/${randomUUID()}/${checked.keyName}`;
    await this.storage.put(storageKey, checked.buffer, checked.contentType);
    const what = FILE_WORDS[media.type];
    try {
      await this.db.transaction(async (tx) => {
        const [document] = await tx
          .insert(documents)
          .values({
            customerId: home.customerId,
            projectId: home.projectId,
            leadId: home.leadId,
            category: 'other',
            source: 'upload',
            name: checked.name,
            storageKey,
            contentType: checked.contentType,
            sizeBytes: checked.buffer.length,
          })
          .returning({ id: documents.id });
        if (!document) throw new Error('Document insert returned nothing');
        await linkChatFile(tx, media.id, document.id);
        if (home.projectId)
          await tx.insert(projectActivities).values({
            projectId: home.projectId,
            kind: 'whatsapp_file',
            message: `Customer sent ${what} on WhatsApp: ${checked.name}`,
            data: { documentId: document.id },
          });
        if (home.leadId)
          await logLead(tx, home.leadId, null, 'whatsapp', `Customer sent ${what} on WhatsApp`);
        // A voice note or video already reached a person through the hand-over alert.
        const handedOver =
          chat.state !== 'human' && (media.type === 'audio' || media.type === 'video');
        if (!handedOver)
          await tellChatTeam(tx, chat, {
            kind: 'whatsapp_message',
            title: `WhatsApp from ${chat.profileName ?? chat.phone}`,
            body: `Sent ${what}. Saved in Documents.`,
            // The same key as the "customer wrote" alert, so the person hears once.
            key: `wa_in:${message.waMessageId}`,
          });
      });
    } catch (error) {
      await this.storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
  }

  /** Where the file belongs: the customer's newest active project, else their lead. */
  private async homeOf(chat: Conversation): Promise<{
    customerId: string | null;
    projectId: string | null;
    leadId: string | null;
  } | null> {
    if (chat.customerId) {
      const [newest] = await activeHomes(this.db, chat.customerId);
      return { customerId: chat.customerId, projectId: newest?.id ?? null, leadId: null };
    }
    const [lead] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.phoneE164, chat.phone))
      .orderBy(desc(leads.createdAt))
      .limit(1);
    return lead ? { customerId: null, projectId: null, leadId: lead.id } : null;
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
