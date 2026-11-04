import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { ChatFileKeeper } from '../chat-file-keeper';
import { isFiled } from '../chat-files-kept';
import {
  type Conversation,
  chatDocumentFor,
  lockedChat,
  queueReply,
  setState,
} from '../chat-store';
import { HEARD, heardReply } from '../onboarding/onboarding-turn-files';
import type { IncomingMedia } from '../whatsapp-events';
import { stepOf } from './chat-step';
import { withFile } from './files-wait';
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

/**
 * Photos and papers a customer sends on WhatsApp (PRD 6.1, redesign 5.2), kept only for the
 * customer whose number sent them. Each file was stored once when it arrived
 * (`ChatFileKeeper`). A photo or PDF never files itself: it waits, with the others of its
 * burst, until we ask "What is this?" (15 seconds after the last one, `FileQuestionsService`).
 * A problem being reported takes its photos at once.
 */
@Injectable()
export class MediaIntakeService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly files: ChatFileKeeper,
    private readonly problems: ProblemFlowService,
    private readonly people: HandOverService,
  ) {}

  /**
   * In order: the problem being reported, the request raised a moment ago, else the file
   * waits for "What is this?". In a chat a person holds the questions still go out.
   */
  async receive(
    chat: Conversation,
    customerId: string,
    media: IncomingMedia,
    said: string,
  ): Promise<void> {
    // A voice note or a video goes warmly to their person, as for leads (C12); it is put on
    // a home when that needs no question (`ChatFileKeeper.settle`).
    if (media.type === 'audio' || media.type === 'video') {
      if (chat.state === 'human' && stepOf(chat) !== 'await_problem') return;
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
    return this.wait(chat, media, now);
  }

  /** The file waits with its burst; the question is due `FILE_WAIT_SECONDS` after this one. */
  private async wait(chat: Conversation, media: IncomingMedia, now: number): Promise<void> {
    const documentId = await this.storedOrSay(chat, media);
    // Filed already (Meta's retry of a file the customer has answered for): nothing to ask.
    if (!documentId || (await isFiled(this.db, documentId))) return;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const file = {
        id: documentId,
        media: media.id,
        type: media.type === 'image' ? ('image' as const) : ('document' as const),
        at: now,
      };
      const filesWait = withFile(locked.context, file, now, this.env.FILE_WAIT_SECONDS);
      await setState(tx, locked.id, locked.state, { ...(locked.context as object), filesWait });
    });
  }

  /** The words of "Report a problem": they raise it, with any photos sent just before. */
  async problemText(chat: Conversation, customerId: string, said: string): Promise<void> {
    const pending = said.trim().length >= 5 ? pendingMedia(chat.context, Date.now()) : [];
    return this.problems.raise(chat, customerId, said, await this.storedPending(pending));
  }

  /** The document this file was stored as, or null after telling the customer it was not. */
  private async storedOrSay(chat: Conversation, media: IncomingMedia): Promise<string | null> {
    const documentId = await chatDocumentFor(this.db, media.id);
    if (documentId) return documentId;
    // Said once and true: too big, a kind we cannot open, or a download that may work later.
    const why = this.files.refusalFor(media.id);
    const body =
      why === 'too_large'
        ? MEDIA_WORDS.tooLarge
        : why === 'wrong_type'
          ? MEDIA_WORDS.wrongType
          : MEDIA_WORDS.failed;
    await queueReply(this.db, chat, { kind: 'text', body });
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
}
