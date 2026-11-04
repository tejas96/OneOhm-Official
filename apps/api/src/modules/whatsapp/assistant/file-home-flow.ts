import { Inject, Injectable } from '@nestjs/common';
import type { DatabaseExecutor } from '@oneohm/database';
import { DATABASE, type Database } from '../../../config/core.module';
import { type CustomerHome, customerHomes } from '../../customer-portal/customer-homes';
import {
  type Conversation,
  chatDocumentFor,
  lockedChat,
  queueReply,
  setState,
} from '../chat-store';
import { setStep, stepOf } from './chat-step';
import { sayWithTaps } from './closing-taps';
import {
  fileHomeTapped,
  type HomeChoice,
  homeForFile,
  toSortOf,
  withoutStep,
  withToSort,
} from './file-home';
import { FilePaperFlowService } from './file-paper-flow';
import { unfiledFiles } from './paper-reads';
import { PROJECT_WORDS } from './project-words';
import { MEDIA_WORDS, WORDS } from './words';

/** A list keeps 10 rows: 9 homes and the person row. */
const HOME_ROWS = 9;

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
    private readonly papers: FilePaperFlowService,
  ) {}

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
      const files = await unfiledFiles(tx, customerId, waiting);
      const fileHome = { propertyId: choice.propertyId, at: now };
      const context = { ...withoutStep(locked.context), fileHome };
      await setStep(tx, locked, 'menu', context);
      // Nothing waits (filed already, or the list was left): the home is only remembered.
      if (files.length === 0) {
        const home = homes.find((each) => each.propertyId === choice.propertyId);
        const words = MEDIA_WORDS.homeChosen(home?.title ?? MEDIA_WORDS.personRow);
        return sayWithTaps(tx, locked, words, ['menu']);
      }
      const after = { ...locked, state: locked.state === 'human' ? 'human' : 'menu', context };
      // The files answer that home's paper, or ask "Which paper?", and the customer hears.
      await this.papers.file(tx, after, customerId, homes, choice, files);
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
