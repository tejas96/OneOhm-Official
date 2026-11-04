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
import { answersRequests, type HomeChoice, type KeptFile, kindOf, placeOn } from './file-home';
import {
  matchPaper,
  type OpenPaper,
  onHomeOf,
  type PaperMatch,
  type PaperWait,
  paperRows,
  papersForHome,
  paperTapped,
  paperWaitOf,
  rememberedPaper,
  savedWords,
  stillNeededFor,
  withoutPaperStep,
} from './paper-match';
import { earlierPaper, freeFiles, openPapersOf, placeOf, unfiledFiles } from './paper-reads';
import { endWait, fileAll, remember } from './paper-steps';
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
    const all = await openPapersOf(tx, customerId);
    const open = papersForHome(all, choice, homes.length);
    const place = placeOn(homes, choice);
    const wait = paperWaitOf(chat.context, now);
    const asking = stepOf(chat) === 'await_file_paper' && wait?.propertyId === choice.propertyId;
    const match = options.match ?? (await this.decide(tx, chat, customerId, choice, asking, open));
    const first = files.find((file) => answersRequests(file.contentType));
    if (match.kind === 'ask' && first) {
      await fileAll(tx, files, place, place);
      await this.waitFor(tx, chat, choice, files, open, asking ? wait : null);
      return false;
    }
    const { answered, refused, target } = await this.answer(tx, customerId, match, first, place);
    const rest = answered ? files.filter((file) => file !== first) : files;
    await fileAll(tx, rest, target, place);
    if (answered) await remember(tx, chat, answered, choice, options.mediaId);
    const named = answered?.title ?? (match.kind === 'same' ? match.title : null);
    const left = stillNeededFor(all, open, choice, homes.length).filter(
      (paper) => paper.id !== answered?.id,
    );
    const home = homes.find((each) => each.propertyId === choice.propertyId)?.title ?? null;
    const words = savedWords(MEDIA_WORDS, home, named ?? kindOf(files), refused, left);
    // The rest of a batch is filed quietly (the first reply said it); in a chat a person
    // holds, only a paper answered (or refused) is said.
    const quiet = match.kind === 'same' || (options.held && !answered && !refused);
    if (!quiet) await sayWithTaps(tx, chat, words, ['menu']);
    return !named && choice.propertyId !== 'person';
  }

  /**
   * A row of "Which paper?" tapped, even late: the stored files still free answer that
   * request while it is open for their home, or are left saved on it ("Something else").
   */
  async tapped(chat: Chat, customerId: string, choiceId: string): Promise<void> {
    const picked = paperTapped(choiceId);
    if (!picked) return;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const wait = paperWaitOf(locked.context);
      const files = wait ? await freeFiles(tx, customerId, wait.ids) : [];
      // Nothing left to file: the files were used already, or none waited.
      if (!wait || files.length === 0)
        return queueReply(tx, locked, { kind: 'text', body: MEDIA_WORDS.paperAskEnded });
      const homes = await customerHomes(tx, customerId);
      const choice = { propertyId: wait.propertyId };
      const asking = stepOf(locked) === 'await_file_paper';
      const ended = withoutPaperStep(locked.context, asking);
      if (!placeOn(homes, choice)) {
        await endWait(tx, locked, asking, ended);
        return queueReply(tx, locked, { kind: 'text', body: PROJECT_WORDS.homeGone });
      }
      const open = papersForHome(await openPapersOf(tx, customerId), choice, homes.length);
      const request = open.find((paper) => paper.id === picked);
      // Not open now, or not theirs: nothing is answered; asked again while any is open.
      if (picked !== 'none' && !request) {
        await queueReply(tx, locked, { kind: 'text', body: MEDIA_WORDS.paperGone });
        const paperWait = { ...wait, at: Date.now() };
        if (open.length > 0)
          return this.list(tx, locked, open, { ...(locked.context as object), paperWait });
      }
      const none = { requestId: 'none', propertyId: choice.propertyId, at: Date.now() };
      const context = picked === 'none' ? { ...ended, filePaper: none } : ended;
      const after = await endWait(tx, locked, asking, context);
      const match: PaperMatch = request ? { kind: 'answer', request } : { kind: 'file' };
      await this.file(tx, after, customerId, homes, choice, files, { match });
    });
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
      const filed = await placeOf(tx, first.id);
      // A home paper asked for with no project lands on the home it was sent for.
      const moved = onHomeOf(filed, place);
      if (moved) await filePaper(tx, first.id, moved);
      return { answered: match.request, refused: null, target: moved ?? filed };
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      // Not usable for the request (answered a moment ago): it stays on the home.
      return { answered: null, refused: match.request.title, target: place };
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
