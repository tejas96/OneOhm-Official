import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../../config/core.module';
import type { CustomerHome } from '../../customer-portal/customer-homes';
import { ChatFileKeeper } from '../chat-file-keeper';
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
import { sayWithTaps } from './closing-taps';
import { type HomeChoice, homeForFile } from './file-home';
import { FileHomeFlowService } from './file-home-flow';
import { FilePaperFlowService } from './file-paper-flow';
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
    private readonly homes: FileHomeFlowService,
    private readonly papers: FilePaperFlowService,
    private readonly problems: ProblemFlowService,
    private readonly people: HandOverService,
  ) {}

  /**
   * In order: the problem being reported, the request raised a moment ago, then the home
   * it is for: asked once when the customer has two or more ("Which home?"), then the
   * paper OneOhm asked for on that home ("Which paper?" when two or more are open). A file
   * that answers nothing is saved on the home and the customer is told so (decision 4).
   * In a chat a person holds, only the questions and the answered paper go out.
   */
  async receive(
    chat: Conversation,
    customerId: string,
    media: IncomingMedia,
    said: string,
  ): Promise<void> {
    const held = chat.state === 'human' && stepOf(chat) !== 'await_problem';
    // A voice note or a video goes warmly to their person, as for leads (C12). It is put
    // on a home when that needs no question (`ChatFileKeeper.settle`), else it waits with
    // the other files for "Which home?".
    if (media.type === 'audio' || media.type === 'video') {
      await this.homes.sortLater(chat, customerId, media.id);
      if (held) return;
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
    return this.forHome(chat, customerId, media, held);
  }

  /** "Which home?" once for two or more homes; then the papers asked for on that home. */
  private async forHome(
    chat: Conversation,
    customerId: string,
    media: IncomingMedia,
    held: boolean,
  ): Promise<void> {
    const now = Date.now();
    let { homes, choice } = await homeForFile(this.db, chat, customerId, now);
    if (choice === 'ask') {
      const documentId = await this.storedOrSay(chat, media);
      // Asked (or added to the burst); else a tap picked the home a moment ago.
      const known = documentId ? await this.homes.ask(chat, customerId, documentId) : null;
      if (!known) return;
      ({ homes, choice } = known);
    }
    if (choice) return this.fulfil(chat, customerId, homes, choice, media, held);
    // No home at all: it stays under the customer (`ChatFileKeeper.settle` alerts the team).
    if (held) return;
    await this.keepForProblem(chat, media, now);
    return sayWithTaps(this.db, chat, MEDIA_WORDS.paperSaved(MEDIA_WORDS.what[media.type]), [
      'menu',
    ]);
  }

  /** The words of "Report a problem": they raise it, with any photos sent just before. */
  async problemText(chat: Conversation, customerId: string, said: string): Promise<void> {
    const pending = said.trim().length >= 5 ? pendingMedia(chat.context, Date.now()) : [];
    return this.problems.raise(chat, customerId, said, await this.storedPending(pending));
  }

  /** Files it on the home: the paper it answers, "Which paper?", or saved as it is. */
  private async fulfil(
    chat: Conversation,
    customerId: string,
    homes: readonly CustomerHome[],
    choice: HomeChoice,
    media: IncomingMedia,
    held: boolean,
  ): Promise<void> {
    const documentId = await this.storedOrSay(chat, media);
    if (!documentId) return;
    const options = { held, mediaId: media.id };
    const stray = await this.papers.receive(chat, customerId, homes, choice, documentId, options);
    // A photo that answers nothing may show a problem the customer reports next.
    if (stray && !held) await this.keepForProblem(chat, media, Date.now());
  }

  /** Keeps only the file's reference, so "Report a problem" next takes it too. */
  private async keepForProblem(chat: Conversation, media: IncomingMedia, now: number) {
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const pending = [...pendingMedia(locked.context, now), { ...media, at: now }];
      const context = { ...(locked.context as object), pending: pending.slice(-MAX_PENDING) };
      await setState(tx, locked.id, locked.state, context);
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
