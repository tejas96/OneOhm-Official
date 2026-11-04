import { Inject, Injectable } from '@nestjs/common';
import type { CustomerDocumentRequest } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documents } from '@oneohm/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { type CustomerHome, customerHomes } from '../../customer-portal/customer-homes';
import { isFiled } from '../chat-files-kept';
import {
  type Conversation,
  chatDocumentFor,
  lockedChat,
  queueReply,
  setState,
} from '../chat-store';
import { filePaper } from '../file-paper';
import { setStep, stepOf } from './chat-step';
import { sayWithTaps } from './closing-taps';
import {
  answersRequests,
  fileHomeTapped,
  type HomeChoice,
  homeForFile,
  isSound,
  type KeptFile,
  kindOf,
  placeOn,
  requestFits,
  toSortOf,
  withoutStep,
  withToSort,
} from './file-home';
import { PROJECT_WORDS } from './project-words';
import { MEDIA_WORDS, WORDS } from './words';

/** A list keeps 10 rows: 9 homes and the person row. */
const HOME_ROWS = 9;

/** What filing a batch on a home did: the files filed, the request answered or refused, what is left. */
export interface FiledOnHome {
  readonly filed: readonly KeptFile[];
  readonly answered: string | null;
  readonly refused: string | null;
  readonly left: readonly string[];
}

/**
 * "Which home is this for?" (papers per home, flow 2): a customer with two or more homes
 * is asked once per burst of files; the files wait under the customer as "To sort" and the
 * answer files them all, and every file sent in the next 30 minutes. The chat row is
 * locked while its waiting files change, since Meta posts a burst all at once.
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
   * Files these stored files of the customer on the home, skipping any already filed: the
   * first photo or PDF answers the oldest open request, as an upload in the app would; the
   * rest (or all, when none is open) are filed on the home. A voice note or video never
   * answers a request and keeps its kind (`other`), even on the person row.
   */
  async fileOnHome(
    customerId: string,
    homes: readonly CustomerHome[],
    choice: HomeChoice,
    documentIds: readonly string[],
    db: DatabaseExecutor = this.db,
  ): Promise<FiledOnHome> {
    const files = await this.unfiled(db, customerId, documentIds);
    const open = await this.openFor(customerId, choice);
    // The list comes newest first, so the oldest open request is the last one.
    const oldest = open.at(-1);
    const first = files.find((file) => answersRequests(file.contentType));
    let rest = files;
    let answered: string | null = null;
    let refused: string | null = null;
    if (oldest && first) {
      rest = files.filter((file) => file !== first);
      try {
        await this.papers.answerWithDocument(customerId, oldest.id, first.id);
        answered = oldest.title;
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        // Not usable for the request: that file stays "To sort", and the team hears of it.
        refused = oldest.title;
      }
    }
    const place = placeOn(homes, choice);
    if (place && rest.length > 0)
      await db.transaction(async (tx) => {
        for (const file of rest)
          await filePaper(
            tx,
            file.id,
            isSound(file.contentType) ? { ...place, category: 'other' } : place,
          );
      });
    const filed = [...(answered && first ? [first] : []), ...(place ? rest : [])];
    const left = open.filter((paper) => !answered || paper !== oldest);
    return { filed, answered, refused, left: left.reverse().map((paper) => paper.title) };
  }

  /**
   * Keeps the file as "To sort" and asks which home, once while the question is open. The
   * home is decided again on the locked chat: when a tap just picked it, nothing is asked
   * and the home is given back to file the paper on.
   */
  ask(chat: Conversation, customerId: string, documentId: string) {
    return this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const known = await homeForFile(tx, locked, customerId);
      if (known.choice !== 'ask') return { homes: known.homes, choice: known.choice };
      const toSort = withToSort(locked.context, documentId, Date.now());
      const context = { ...(locked.context as object), toSort };
      if (stepOf(locked) === 'await_file_home')
        await setState(tx, locked.id, locked.state, context);
      else await this.list(tx, locked, known.homes, context);
      return null;
    });
  }

  /**
   * A voice note or video waits with the other files when the home is not known, so the
   * answer files it too; it never asks on its own.
   */
  async sortLater(chat: Conversation, customerId: string, mediaId: string): Promise<void> {
    const { choice } = await homeForFile(this.db, chat, customerId);
    const documentId = choice === 'ask' ? await chatDocumentFor(this.db, mediaId) : null;
    if (!documentId) return;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const toSort = withToSort(locked.context, documentId, Date.now());
      await setState(tx, locked.id, locked.state, { ...(locked.context as object), toSort });
    });
  }

  /**
   * A row of "Which home?" tapped: the waiting files go on that home, remembered 30
   * minutes. They leave the list only once filed, so Meta's retry of the tap is safe.
   */
  async tapped(chat: Conversation, customerId: string, choiceId: string): Promise<void> {
    const picked = fileHomeTapped(choiceId);
    if (!picked) return;
    await this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const homes = await customerHomes(tx, customerId);
      const choice = await this.pickedHome(tx, locked, homes, picked);
      if (!choice) return;
      const now = Date.now();
      const waiting = toSortOf(locked.context, now).map((entry) => entry.id);
      const filed = await this.fileOnHome(customerId, homes, choice, waiting, tx);
      const fileHome = { propertyId: choice.propertyId, at: now };
      await setStep(tx, locked, 'menu', { ...withoutStep(locked.context), fileHome });
      const home = homes.find((each) => each.propertyId === choice.propertyId);
      await sayWithTaps(tx, locked, this.savedWords(filed, home), ['menu']);
    });
  }

  /** The home tapped; one no longer active is said so, then the list again (or the one left). */
  private async pickedHome(
    tx: DatabaseExecutor,
    chat: Conversation,
    homes: readonly CustomerHome[],
    picked: string,
  ): Promise<HomeChoice | null> {
    if (picked === 'person' || homes.some((home) => home.propertyId === picked))
      return { propertyId: picked };
    await queueReply(tx, chat, { kind: 'text', body: PROJECT_WORDS.homeGone });
    const [only] = homes;
    // Still two homes: ask again, nothing filed. One left: it is that one, never asked.
    if (homes.length > 1) {
      await this.list(tx, chat, homes, { ...(chat.context as object) });
      return null;
    }
    if (!only) {
      await setStep(tx, chat, 'menu', withoutStep(chat.context));
      return null;
    }
    return { propertyId: only.propertyId };
  }

  /** "Saved: *photo (4)* for your home at *Pune*." and what it still needs; no claim when nothing was filed. */
  private savedWords(filed: FiledOnHome, home: CustomerHome | undefined): string {
    const refused = filed.refused ? MEDIA_WORDS.paperRefused(filed.refused) : '';
    if (filed.filed.length === 0)
      return refused || MEDIA_WORDS.homeChosen(home?.title ?? MEDIA_WORDS.personRow);
    const kind = filed.answered ?? kindOf(filed.filed);
    const saved = home ? MEDIA_WORDS.savedFor(kind, home.title) : MEDIA_WORDS.paperSaved(kind);
    const left = filed.left.length > 0 ? MEDIA_WORDS.stillNeeded(filed.left.join(', ')) : '';
    return [saved, refused, left].filter(Boolean).join('\n\n');
  }

  /** The customer's own kept files among these, not removed and not filed yet, in order. */
  private async unfiled(db: DatabaseExecutor, customerId: string, documentIds: readonly string[]) {
    if (documentIds.length === 0) return [];
    const own = await db
      .select({ id: documents.id, contentType: documents.contentType })
      .from(documents)
      .where(
        and(
          inArray(documents.id, [...documentIds]),
          eq(documents.customerId, customerId),
          isNull(documents.removedAt),
        ),
      );
    const open = new Map<string, KeptFile>();
    for (const file of own) if (!(await isFiled(db, file.id))) open.set(file.id, file);
    return documentIds.flatMap((id) => open.get(id) ?? []);
  }

  /** The "Which home?" list (the homes, newest first, and the person row), then the step. */
  private async list(
    db: DatabaseExecutor,
    chat: Conversation,
    homes: readonly CustomerHome[],
    context: Record<string, unknown>,
  ): Promise<void> {
    await queueReply(db, chat, {
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
    await setStep(db, chat, 'await_file_home', context);
  }
}
