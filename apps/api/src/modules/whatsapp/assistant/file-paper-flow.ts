import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseExecutor } from '@oneohm/database';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { type CustomerHome, customerHomes } from '../../customer-portal/customer-homes';
import { type Conversation, lockedChat, queueReply, setState } from '../chat-store';
import { filePaper, type PaperPlace } from '../file-paper';
import { setStep, stepOf } from './chat-step';
import { sayWithTaps } from './closing-taps';
import {
  answersRequests,
  type HomeChoice,
  isSound,
  type KeptFile,
  kindOf,
  placeOn,
} from './file-home';
import {
  matchPaper,
  type OpenPaper,
  type PaperMatch,
  type PaperWait,
  paperRows,
  papersForHome,
  paperTapped,
  paperWaitOf,
  rememberedPaper,
  savedWords,
  withoutPaperStep,
} from './paper-match';
import { earlierPaper, freeFiles, openPapersOf, placeOf, unfiledFiles } from './paper-reads';
import { PAPER_WORDS } from './paper-words';
import { PROJECT_WORDS } from './project-words';
import { MEDIA_WORDS } from './words';

type Chat = Conversation;

/**
 * "Which paper is this?" (papers per home, flow 3): a file answers only an open request of
 * the home it is for. One open: it answers it. Two or more: the customer is asked once,
 * and the files wait on the home. The pick covers 30 minutes, so the back of an Aadhaar
 * card is filed with its front. The customer hears what was saved and what that home
 * still needs. The chat row is locked while this is decided, as for "Which home?".
 */
@Injectable()
export class FilePaperFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly papers: CustomerDocumentRequestsService,
  ) {}

  /** A file just sent for a known home; true when it was a stray (no paper, not ID). */
  receive(
    chat: Chat,
    customerId: string,
    homes: readonly CustomerHome[],
    choice: HomeChoice,
    documentId: string,
    options: { held: boolean; mediaId: string },
  ): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const files = await unfiledFiles(tx, customerId, [documentId]);
      if (files.length === 0) return false;
      return this.file(tx, locked, customerId, homes, choice, files, options);
    });
  }

  /**
   * Files these kept files on the home with its open requests, then tells the customer
   * (unless a person holds the chat and no paper was answered). The caller holds the lock.
   */
  async file(
    tx: DatabaseExecutor,
    chat: Chat,
    customerId: string,
    homes: readonly CustomerHome[],
    choice: HomeChoice,
    files: readonly KeptFile[],
    options: { held?: boolean; mediaId?: string; match?: PaperMatch } = {},
  ): Promise<boolean> {
    const now = Date.now();
    const open = papersForHome(await openPapersOf(tx, customerId), choice, homes.length);
    const place = placeOn(homes, choice);
    const wait = paperWaitOf(chat.context, now);
    const asking = stepOf(chat) === 'await_file_paper' && wait?.propertyId === choice.propertyId;
    const match = options.match ?? (await this.decide(tx, chat, customerId, choice, asking, open));
    const first = files.find((file) => answersRequests(file.contentType));
    if (match.kind === 'ask' && first) {
      await this.fileAll(tx, files, place, place);
      await this.waitFor(tx, chat, choice, files, open, asking ? wait : null);
      return false;
    }
    const { answered, refused, target } = await this.answer(tx, customerId, match, first, place);
    const rest = answered ? files.filter((file) => file !== first) : files;
    await this.fileAll(tx, rest, target, place);
    if (answered) await this.remember(tx, chat, answered, choice, options.mediaId);
    const named = answered?.title ?? (match.kind === 'same' ? match.title : null);
    // In a chat a person holds, only a paper answered (or refused) is said.
    const left = open.filter((paper) => paper.id !== answered?.id);
    const home = homes.find((each) => each.propertyId === choice.propertyId)?.title ?? null;
    const words = savedWords(MEDIA_WORDS, home, named ?? kindOf(files), refused, left);
    if (!options.held || answered || refused) await sayWithTaps(tx, chat, words, ['menu']);
    return !named && choice.propertyId !== 'person';
  }

  /** A row of "Which paper?" tapped: the waiting files answer that request, or none. */
  async tapped(chat: Chat, customerId: string, choiceId: string): Promise<void> {
    const picked = paperTapped(choiceId);
    if (!picked) return;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const { wait, files } = await this.waiting(tx, locked, customerId);
      if (!wait || files.length === 0)
        return queueReply(tx, locked, { kind: 'text', body: MEDIA_WORDS.paperAskEnded });
      const homes = await customerHomes(tx, customerId);
      const choice = { propertyId: wait.propertyId };
      const ended = withoutPaperStep(locked.context);
      if (!placeOn(homes, choice)) {
        await setStep(tx, locked, 'menu', ended);
        return queueReply(tx, locked, { kind: 'text', body: PROJECT_WORDS.homeGone });
      }
      const open = papersForHome(await openPapersOf(tx, customerId), choice, homes.length);
      const request = open.find((paper) => paper.id === picked);
      // Not open now, or not theirs: nothing is answered; asked again while any is open.
      if (picked !== 'none' && !request) {
        await queueReply(tx, locked, { kind: 'text', body: MEDIA_WORDS.paperGone });
        if (open.length > 0) return this.list(tx, locked, open, { ...(locked.context as object) });
      }
      const none = { requestId: 'none', propertyId: choice.propertyId, at: Date.now() };
      const context = picked === 'none' ? { ...ended, filePaper: none } : ended;
      await setStep(tx, locked, 'menu', context);
      const after = { ...locked, state: locked.state === 'human' ? 'human' : 'menu', context };
      const match: PaperMatch = request ? { kind: 'answer', request } : { kind: 'file' };
      await this.file(tx, after, customerId, homes, choice, files, { match });
    });
  }

  /**
   * The paper answered covers the next 30 minutes of files (front and back); Meta's retry
   * of the same file is told it was saved.
   */
  private async remember(
    tx: DatabaseExecutor,
    chat: Chat,
    answered: OpenPaper,
    choice: HomeChoice,
    mediaId: string | undefined,
  ): Promise<void> {
    const filePaper = { requestId: answered.id, propertyId: choice.propertyId, at: Date.now() };
    const context = { ...(chat.context as object), filePaper };
    const filedMedia = mediaId ? { filedMedia: { id: mediaId, title: answered.title } } : {};
    await setState(tx, chat.id, chat.state, { ...context, ...filedMedia });
  }

  /** The files the open "Which paper?" waits on; none once it ended or went stale. */
  private async waiting(tx: DatabaseExecutor, chat: Chat, customerId: string) {
    const wait = stepOf(chat) === 'await_file_paper' ? paperWaitOf(chat.context, Date.now()) : null;
    return { wait, files: wait ? await freeFiles(tx, customerId, wait.ids) : [] };
  }

  /** The photos and papers wait for "Which paper?", asked once while it is open. */
  private async waitFor(
    tx: DatabaseExecutor,
    chat: Chat,
    choice: HomeChoice,
    files: readonly KeptFile[],
    open: readonly OpenPaper[],
    before: PaperWait | null,
  ): Promise<void> {
    const ids = files.filter((file) => answersRequests(file.contentType)).map((file) => file.id);
    const paperWait: PaperWait = {
      propertyId: choice.propertyId,
      at: before?.at ?? Date.now(),
      ids: [...(before?.ids ?? []), ...ids],
    };
    const context = { ...(chat.context as object), paperWait };
    if (before) await setState(tx, chat.id, chat.state, context);
    else await this.list(tx, chat, open, context);
  }

  /** What the file does: wait for the open question, else the paper picked or the rule. */
  private async decide(
    tx: DatabaseExecutor,
    chat: Chat,
    customerId: string,
    choice: HomeChoice,
    asking: boolean,
    open: readonly OpenPaper[],
  ): Promise<PaperMatch> {
    if (asking) return { kind: 'ask' };
    const remembered = rememberedPaper(chat.context, choice, Date.now());
    const earlier = await earlierPaper(tx, customerId, remembered);
    return matchPaper({ open, remembered, earlier });
  }

  /** The request answered with the first photo or PDF, and where the batch's papers go. */
  private async answer(
    tx: DatabaseExecutor,
    customerId: string,
    match: PaperMatch,
    first: KeptFile | undefined,
    place: PaperPlace | null,
  ) {
    if (match.kind === 'same')
      return { answered: null, refused: null, target: await placeOf(tx, match.documentId) };
    if (match.kind !== 'answer' || !first) return { answered: null, refused: null, target: place };
    try {
      await this.papers.answerWithDocument(customerId, match.request.id, first.id, tx);
      return { answered: match.request, refused: null, target: await placeOf(tx, first.id) };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // Not usable for the request (answered a moment ago): it stays on the home.
      return { answered: null, refused: match.request.title, target: place };
    }
  }

  /** Photos and papers go to `papers`; a voice note or video stays `other` on the home. */
  private async fileAll(
    tx: DatabaseExecutor,
    files: readonly KeptFile[],
    papers: PaperPlace | null,
    home: PaperPlace | null,
  ): Promise<void> {
    for (const file of files) {
      const sound = isSound(file.contentType);
      const to = sound ? (home ? { ...home, category: 'other' } : null) : papers;
      if (to) await filePaper(tx, file.id, to);
    }
  }

  /** The "Which paper?" list (the home's open requests and "Something else"), then the step. */
  private async list(
    tx: DatabaseExecutor,
    chat: Chat,
    open: readonly OpenPaper[],
    context: Record<string, unknown>,
  ): Promise<void> {
    await queueReply(tx, chat, {
      kind: 'list',
      body: MEDIA_WORDS.whichPaper,
      button: PAPER_WORDS.button,
      rows: paperRows(open, PAPER_WORDS.paper, MEDIA_WORDS.somethingElse),
    });
    await setStep(tx, chat, 'await_file_paper', context);
  }
}
