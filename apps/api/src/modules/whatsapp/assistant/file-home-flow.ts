import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { documents } from '@oneohm/database';
import { inArray } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { type CustomerHome, customerHomes } from '../../customer-portal/customer-homes';
import { isFiled } from '../chat-files-kept';
import { type Conversation, queueReply, setState } from '../chat-store';
import { filePaper } from '../file-paper';
import { setStep, stepOf } from './chat-step';
import { sayWithTaps } from './closing-taps';
import {
  fileHomeTapped,
  type HomeChoice,
  MAX_TO_SORT,
  placeOn,
  requestFits,
  toSortOf,
} from './file-home';
import { PROJECT_WORDS } from './project-words';
import { MEDIA_WORDS, WORDS } from './words';

/** A list keeps 10 rows: 9 homes and the person row. */
const HOME_ROWS = 9;

/** What filing a batch on a home did: the request it answered, or refused, and what is left. */
export interface FiledOnHome {
  readonly answered: string | null;
  readonly refused: string | null;
  readonly left: readonly string[];
}

/** The chat's context without the "Which home?" step and its files. */
function withoutStep(context: unknown): Record<string, unknown> {
  const {
    toSort: _toSort,
    step: _step,
    stepAt: _stepAt,
    ...rest
  } = (context ?? {}) as Record<string, unknown>;
  return rest;
}

/**
 * "Which home is this for?" (papers per home, flow 2): a customer with two or more homes
 * is asked once per burst of files; the files wait under the customer as "To sort" and the
 * answer files them all, and every file sent in the next 30 minutes.
 */
@Injectable()
export class FileHomeFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly papers: CustomerDocumentRequestsService,
  ) {}

  /** The open requests a file for this home answers, newest first. */
  async openFor(customerId: string, choice: HomeChoice): Promise<CustomerDocumentRequest[]> {
    const list = await this.papers.list(customerId);
    return list.filter((paper) => paper.status === 'open' && requestFits(choice, paper.category));
  }

  /**
   * Files these stored files on the home: the first answers the oldest open request, as an
   * upload in the app would; the rest (or all, when none is open) are filed on the home.
   */
  async fileOnHome(
    customerId: string,
    homes: readonly CustomerHome[],
    choice: HomeChoice,
    documentIds: readonly string[],
  ): Promise<FiledOnHome> {
    const open = await this.openFor(customerId, choice);
    // The list comes newest first, so the oldest open request is the last one.
    const oldest = open.at(-1);
    let rest = documentIds;
    let answered: string | null = null;
    let refused: string | null = null;
    if (oldest && documentIds[0]) {
      rest = documentIds.slice(1);
      try {
        await this.papers.answerWithDocument(customerId, oldest.id, documentIds[0]);
        answered = oldest.title;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        // Not usable for the request: that file stays "To sort", and the team hears of it.
        refused = oldest.title;
      }
    }
    const place = placeOn(homes, choice);
    if (place && rest.length > 0)
      await this.db.transaction(async (tx) => {
        for (const id of rest) if (!(await isFiled(tx, id))) await filePaper(tx, id, place);
      });
    const left = open.filter((paper) => !answered || paper !== oldest);
    return { answered, refused, left: left.reverse().map((paper) => paper.title) };
  }

  /** Keeps the file as "To sort" and asks which home, once while the question is open. */
  async ask(chat: Conversation, homes: readonly CustomerHome[], documentId: string) {
    const before = toSortOf(chat.context).filter((id) => id !== documentId);
    const toSort = [...before, documentId].slice(-MAX_TO_SORT);
    const context = { ...(chat.context as object), toSort };
    if (stepOf(chat) === 'await_file_home') return setState(this.db, chat.id, chat.state, context);
    return this.list(chat, homes, context);
  }

  /** A row of "Which home?" tapped: the waiting files go on that home, remembered 30 minutes. */
  async tapped(chat: Conversation, customerId: string, choiceId: string): Promise<void> {
    const picked = fileHomeTapped(choiceId);
    if (!picked) return;
    const homes = await customerHomes(this.db, customerId);
    let choice: HomeChoice = { propertyId: picked };
    if (picked !== 'person' && !homes.some((home) => home.propertyId === picked)) {
      await queueReply(this.db, chat, { kind: 'text', body: PROJECT_WORDS.homeGone });
      const [only] = homes;
      // Still two homes: ask again, nothing filed. One left: it is that one, never asked.
      if (homes.length > 1) return this.list(chat, homes, { ...(chat.context as object) });
      if (!only) return setStep(this.db, chat, 'menu', withoutStep(chat.context));
      choice = { propertyId: only.propertyId };
    }
    const documentIds = toSortOf(chat.context);
    const fileHome = { propertyId: choice.propertyId, at: Date.now() };
    await setStep(this.db, chat, 'menu', { ...withoutStep(chat.context), fileHome });
    const filed = await this.fileOnHome(customerId, homes, choice, documentIds);
    const home = homes.find((each) => each.propertyId === choice.propertyId);
    return sayWithTaps(this.db, chat, await this.savedWords(filed, documentIds, home), ['menu']);
  }

  /** "Saved: *photo (4)* for your home at *Pune*.", and what that home still needs. */
  private async savedWords(
    filed: FiledOnHome,
    documentIds: readonly string[],
    home: CustomerHome | undefined,
  ): Promise<string> {
    if (filed.refused) return MEDIA_WORDS.paperRefused(filed.refused);
    const kind = filed.answered ?? (await this.kindOf(documentIds));
    const saved = home ? MEDIA_WORDS.savedFor(kind, home.title) : MEDIA_WORDS.paperSaved(kind);
    const left = filed.left.length > 0 ? MEDIA_WORDS.stillNeeded(filed.left.join(', ')) : '';
    return [saved, left].filter(Boolean).join('\n\n');
  }

  /** "photo", "paper (3)": how the customer's files are named in the reply. */
  private async kindOf(documentIds: readonly string[]): Promise<string> {
    const files =
      documentIds.length === 0
        ? []
        : await this.db
            .select({ contentType: documents.contentType })
            .from(documents)
            .where(inArray(documents.id, [...documentIds]));
    const photos = files.length > 0 && files.every((file) => file.contentType.startsWith('image/'));
    const what = photos ? MEDIA_WORDS.what.image : MEDIA_WORDS.what.document;
    return files.length > 1 ? `${what} (${files.length})` : what;
  }

  /** The "Which home?" list: the homes, newest first, and the person row. */
  private async list(
    chat: Conversation,
    homes: readonly CustomerHome[],
    context: Record<string, unknown>,
  ): Promise<void> {
    await setStep(this.db, chat, 'await_file_home', context);
    await queueReply(this.db, chat, {
      kind: 'list',
      body: MEDIA_WORDS.whichHome,
      button: WORDS.menuButton,
      rows: [
        ...homes.slice(0, HOME_ROWS).map((home) => ({
          id: `fhome:${home.propertyId}`,
          title: home.title,
          description: home.description,
        })),
        { id: 'fhome:person', title: MEDIA_WORDS.personRow },
      ],
    });
  }
}
