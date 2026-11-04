import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { ChatFileKeeper } from '../chat-file-keeper';
import { type Conversation, chatDocumentFor, queueReply, setState } from '../chat-store';
import { HEARD, heardReply } from '../onboarding/onboarding-turn-files';
import type { IncomingMedia } from '../whatsapp-events';
import { stepOf } from './chat-step';
import { sayWithTaps } from './closing-taps';
import { HandOverService } from './hand-over';
import { ProblemFlowService, recentRequest } from './problem-flow';
import { MEDIA_WORDS } from './words';

/** Files sent before the customer said what they are about wait this long, at most six. */
const PENDING_MINUTES = 60;
const MAX_PENDING = 6;

/** Only WhatsApp's reference to the file is kept while waiting, never the file itself. */
export interface PendingMedia extends IncomingMedia {
  readonly at: number;
}

/** The files still waiting in the chat's memory, oldest first. */
export function pendingMedia(context: unknown, now: number): PendingMedia[] {
  const list = (context as { pending?: unknown } | null)?.pending;
  if (!Array.isArray(list)) return [];
  return (list as PendingMedia[])
    .filter((item) => Boolean(item?.id) && now - item.at <= PENDING_MINUTES * 60_000)
    .slice(-MAX_PENDING);
}

/** What "Report a problem" keeps of the chat's memory: the files waiting for words. */
export function keepPending(context: unknown, now = Date.now()): Record<string, unknown> {
  const pending = pendingMedia(context, now);
  return pending.length > 0 ? { pending } : {};
}

/** The paper just filed, so Meta's retry of the same file is not filed again. */
interface FiledMedia {
  readonly id: string;
  readonly title: string;
}

/**
 * Photos and papers a customer sends on WhatsApp (PRD 6.1), kept only for the customer
 * whose number sent them. Each file was stored once when it arrived (`ChatFileKeeper`);
 * here that same document is filed, through the same rules as an upload in the app.
 */
@Injectable()
export class MediaIntakeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly files: ChatFileKeeper,
    private readonly papers: CustomerDocumentRequestsService,
    private readonly problems: ProblemFlowService,
    private readonly people: HandOverService,
  ) {}

  /**
   * In order: the problem being reported, the request raised a moment ago, the oldest
   * paper OneOhm asked for. Anything else is not stored: we ask what it is about.
   */
  async receive(
    chat: Conversation,
    customerId: string,
    media: IncomingMedia,
    said: string,
  ): Promise<void> {
    // A voice note or a video goes warmly to their person, as for leads (C12).
    if (media.type === 'audio' || media.type === 'video') {
      const reply = heardReply(media.type, await this.people.answererName(chat));
      return this.people.passToOwner(chat, { summary: HEARD[media.type].note, reply });
    }
    const now = Date.now();
    if (stepOf(chat) === 'await_problem') {
      const file = await this.storedOrSay(chat, media);
      if (!file) return;
      const earlier = await this.storedPending(pendingMedia(chat.context, now));
      // A paper's file name is not a description of the problem; only a caption is.
      const words = said === media.fileName ? '' : said;
      return this.problems.raise(chat, customerId, words, [...earlier, file]);
    }
    const raised = recentRequest(chat.context, now);
    if (raised) {
      const file = await this.storedOrSay(chat, media);
      return file ? this.problems.addPhoto(chat, customerId, raised.id, file) : undefined;
    }
    // Meta's retry of a file already filed (the reply after it failed): not filed again.
    const filed = (chat.context as { filedMedia?: FiledMedia }).filedMedia;
    if (filed?.id === media.id)
      return sayWithTaps(this.db, chat, MEDIA_WORDS.paperSaved(filed.title), ['menu']);
    const open = (await this.papers.list(customerId)).filter((paper) => paper.status === 'open');
    if (open.length > 0) return this.fulfil(chat, customerId, open, media);
    return this.ask(chat, media, now);
  }

  /** A person has the chat: a photo or paper still answers the oldest open paper request. */
  async answerOpenRequest(chat: Conversation, customerId: string, media: IncomingMedia) {
    if (media.type === 'audio' || media.type === 'video') return;
    const open = (await this.papers.list(customerId)).filter((paper) => paper.status === 'open');
    if (open.length > 0) await this.fulfil(chat, customerId, open, media);
  }

  /** The words of "Report a problem": they raise it, with any photos sent just before. */
  async problemText(chat: Conversation, customerId: string, said: string): Promise<void> {
    const pending = said.trim().length >= 5 ? pendingMedia(chat.context, Date.now()) : [];
    return this.problems.raise(chat, customerId, said, await this.storedPending(pending));
  }

  /** Answers the oldest open paper request, exactly as an upload in the app would. */
  private async fulfil(
    chat: Conversation,
    customerId: string,
    open: readonly CustomerDocumentRequest[],
    media: IncomingMedia,
  ): Promise<void> {
    // The list comes newest first, so the oldest open request is the last one.
    const oldest = open[open.length - 1];
    if (!oldest) return;
    const documentId = await this.storedOrSay(chat, media);
    if (!documentId) return;
    try {
      await this.papers.answerWithDocument(customerId, oldest.id, documentId);
    } catch (error) {
      if (error instanceof AppError) return this.text(chat, MEDIA_WORDS.paperRefused(oldest.title));
      throw error;
    }
    const filedMedia: FiledMedia = { id: media.id, title: oldest.title };
    await setState(this.db, chat.id, chat.state, { ...(chat.context as object), filedMedia });
    const left = open
      .slice(0, -1)
      .reverse()
      .map((paper) => paper.title);
    const lines = [
      MEDIA_WORDS.paperSaved(oldest.title),
      left.length > 0 ? MEDIA_WORDS.stillNeed(left.join(', ')) : '',
    ];
    return sayWithTaps(this.db, chat, lines.filter(Boolean).join('\n\n'), ['menu']);
  }

  /** Nothing waits for this file: keep only its reference and ask once what it is about. */
  private async ask(chat: Conversation, media: IncomingMedia, now: number): Promise<void> {
    const before = pendingMedia(chat.context, now);
    const pending = [...before, { ...media, at: now }].slice(-MAX_PENDING);
    await setState(this.db, chat.id, chat.state, { ...(chat.context as object), pending });
    if (before.length > 0) return;
    await queueReply(this.db, chat, {
      kind: 'buttons',
      body: MEDIA_WORDS.ask(MEDIA_WORDS.what[media.type]),
      buttons: [
        { id: 'service', title: MEDIA_WORDS.reportProblem },
        { id: 'human', title: MEDIA_WORDS.talkToPerson },
      ],
    });
  }

  /** The document this file was stored as, or null after telling the customer it was not. */
  private async storedOrSay(chat: Conversation, media: IncomingMedia): Promise<string | null> {
    const documentId = await chatDocumentFor(this.db, media.id);
    if (documentId) return documentId;
    const tooLarge = this.files.wasTooLarge(media.id);
    await this.text(chat, tooLarge ? MEDIA_WORDS.tooLarge : MEDIA_WORDS.failed);
    return null;
  }

  /** Files sent earlier, as stored; any that were not kept are quietly left out. */
  private async storedPending(pending: readonly PendingMedia[]): Promise<string[]> {
    const stored: string[] = [];
    for (const media of pending) {
      const documentId = await chatDocumentFor(this.db, media.id);
      if (documentId) stored.push(documentId);
    }
    return stored;
  }

  private async text(chat: Conversation, body: string): Promise<void> {
    await queueReply(this.db, chat, { kind: 'text', body });
  }
}
