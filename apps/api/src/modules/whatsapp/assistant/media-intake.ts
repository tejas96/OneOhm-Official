import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { ChatFileKeeper } from '../chat-file-keeper';
import { isFiled } from '../chat-files-kept';
import { type Conversation, chatDocumentFor, lockedChat, queueReply } from '../chat-store';
import { HEARD, heardReply } from '../onboarding/onboarding-turn-files';
import type { IncomingMedia } from '../whatsapp-events';
import { stepOf } from './chat-step';
import { draftOf } from './complaint-start';
import { withFile } from './files-wait';
import { saveWait } from './files-wait-store';
import { HandOverService } from './hand-over';
import { ProblemFlowService, recentRequest } from './problem-flow';
import { MEDIA_WORDS } from './words';

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
   * The problem being reported takes its photos; any other file waits for "What is this?"
   * (which offers a problem told a moment ago). In a chat a person holds the questions still go out.
   */
  async receive(
    chat: Conversation,
    customerId: string,
    media: IncomingMedia,
    _said: string,
  ): Promise<void> {
    const now = Date.now();
    const reporting = stepOf(chat) === 'await_problem' && draftOf(chat.context) !== null;
    // A voice note sent during a problem report, or right after one, joins the problem (redesign §12):
    // no hand-over. Any other voice note or video goes warmly to their person, as for leads (C12); it
    // is put on a home when that needs no question (`ChatFileKeeper.settle`).
    if (media.type === 'audio' || media.type === 'video') {
      const raised = recentRequest(chat.context, now);
      if (media.type === 'audio' && (reporting || raised)) {
        const documentId = await this.storedOrSay(chat, media);
        if (!documentId) return;
        if (reporting) return this.problems.file(chat, customerId, documentId);
        if (raised && (await this.problems.addVoice(chat, customerId, raised.id, documentId)))
          return;
      }
      if (chat.state === 'human' && stepOf(chat) !== 'await_problem') return;
      const reply = heardReply(media.type, await this.people.answererName(chat));
      return this.people.passToOwner(chat, { summary: HEARD[media.type].note, reply });
    }
    if (reporting) {
      const file = await this.storedOrSay(chat, media);
      if (!file) return;
      return this.problems.file(chat, customerId, file);
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
      await saveWait(tx, locked, filesWait);
    });
  }

  /** The words typed during "Report a problem": the note, once both questions are answered. */
  problemText(chat: Conversation, customerId: string, said: string): Promise<void> {
    return this.problems.words(chat, customerId, said);
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
          : why === 'empty'
            ? MEDIA_WORDS.emptyFile
            : MEDIA_WORDS.failed;
    await queueReply(this.db, chat, { kind: 'text', body });
    return null;
  }
}

export { keepPending, type PendingMedia, pendingMedia } from './pending-media';
