import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseExecutor } from '@oneohm/database';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { customerHomes } from '../../customer-portal/customer-homes';
import { DocumentMoveService } from '../../documents/document-move.service';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { fileAs } from './file-as';
import { FileQuestionsService } from './file-questions';
import {
  type Chosen,
  type FilesWait,
  filesWaitOf,
  isOldQuestion,
  type WhatTap,
  withBatch,
  withoutFiles,
} from './files-wait';
import { saveWait } from './files-wait-store';
import { type KeptFile, placeOn } from './kept-files';
import { openPapersOf, unfiledFiles } from './paper-reads';
import { takePaymentProof } from './payment-proof';
import { ProblemFlowService } from './problem-flow';
import { PROJECT_WORDS } from './project-words';
import { addToProblem, askWhichHome, changeSaved, startProblem } from './what-actions';
import { savedTitle, saySaved, stillAsked } from './what-saved';
import { targetOf } from './what-targets';
import { WHAT_WORDS } from './what-words';
import { MEDIA_WORDS } from './words';

/**
 * The answers to "What is this?" (redesign 5.2): a tap files the waiting files as that paper
 * (asking "For which home?" first when a home paper has two or more homes to choose from),
 * says Saved, and keeps the batch for a day so [Change] can take it back. The chat row is
 * locked while this is decided, as Meta posts a burst of taps all at once.
 */
@Injectable()
export class WhatAnswerService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly questions: FileQuestionsService,
    private readonly requests: CustomerDocumentRequestsService,
    private readonly moves: DocumentMoveService,
    private readonly problems: ProblemFlowService,
  ) {}

  /** A tap on the question, or on a Saved reply. */
  tapped(chat: Conversation, customerId: string, tap: WhatTap): Promise<void> {
    return this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const now = Date.now();
      if (tap.t === 'change')
        return changeSaved(
          tx,
          this.moves,
          (changed, focus) => this.questions.ask(tx, changed, customerId, now, { focus }),
          locked,
          tap.first,
          { customerId, now, delay: this.delay() },
        );
      const wait = filesWaitOf(locked.context);
      if (!wait) return this.say(tx, locked, MEDIA_WORDS.paperAskEnded);
      // [What are they?] on Home asks again about everything that waits.
      if (tap.t === 'ask') return this.askAgain(tx, locked, customerId, now);
      if (isOldQuestion(wait, now)) {
        await queueReply(tx, locked, { kind: 'text', body: WHAT_WORDS.old });
        return this.askAgain(tx, locked, customerId, now);
      }
      const files = await unfiledFiles(tx, customerId, wait.focus ?? wait.files.map((f) => f.id));
      if (files.length === 0) return this.askAgain(tx, locked, customerId, now, true);
      return this.answerTap(tx, locked, customerId, { wait, files, tap, now });
    });
  }

  /** The tap on a live question: more rows, one by one, a fixed row, or a paper. */
  private async answerTap(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    about: { wait: FilesWait; files: readonly KeptFile[]; tap: WhatTap; now: number },
  ): Promise<void> {
    const { wait, files, tap, now } = about;
    if (tap.t === 'more')
      return void (await this.questions.ask(tx, chat, customerId, now, {
        stage: 'more',
        focus: wait.focus,
      }));
    if (tap.t === 'diff') {
      const [first] = files;
      const each = { of: files.length };
      const focus = first ? [first.id] : null;
      return void (await this.questions.ask(tx, chat, customerId, now, { focus, each }));
    }
    if (tap.t === 'prob')
      return startProblem(tx, chat, customerId, { wait, files, now, delay: this.delay() });
    if (tap.t === 'probadd') {
      const added = await addToProblem(tx, this.problems, chat, customerId, files, now);
      return added
        ? this.settle(tx, chat, customerId, wait, files, now)
        : this.askAgain(tx, chat, customerId, now);
    }
    if (tap.t === 'pay') {
      await takePaymentProof(tx, customerId, files, now);
      await sayWithTaps(tx, chat, WHAT_WORDS.payment, ['menu']);
      return this.settle(tx, chat, customerId, wait, files, now);
    }
    const chosen = this.chosenBy(tap, wait);
    if (!chosen) return this.askAgain(tx, chat, customerId, now);
    return this.choose(tx, chat, customerId, { wait, files, chosen, now });
  }

  /** A row of "For which home?" tapped: the picked paper goes on that home. */
  homeTapped(chat: Conversation, customerId: string, propertyId: string): Promise<void> {
    return this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const now = Date.now();
      const wait = filesWaitOf(locked.context);
      const homes = await customerHomes(tx, customerId);
      const files = wait
        ? await unfiledFiles(tx, customerId, wait.focus ?? wait.files.map((f) => f.id))
        : [];
      if (!wait?.pick || files.length === 0) return this.say(tx, locked, MEDIA_WORDS.paperAskEnded);
      if (!homes.some((home) => home.propertyId === propertyId)) {
        await queueReply(tx, locked, { kind: 'text', body: PROJECT_WORDS.homeGone });
        return askWhichHome(tx, locked, homes, wait, wait.pick);
      }
      return this.choose(tx, locked, customerId, {
        wait,
        files,
        chosen: wait.pick,
        now,
        home: propertyId,
      });
    });
  }

  private chosenBy(tap: WhatTap, wait: FilesWait): Chosen | null {
    if (tap.t === 'a') return { kind: 'ask', actionId: tap.actionId };
    if (tap.t === 'i') return { kind: 'item', key: tap.key, propertyId: tap.propertyId };
    if (tap.t === 'other') return { kind: 'other' };
    if (tap.t === 'yes' && wait.offered) return { kind: 'ask', actionId: wait.offered };
    return null;
  }

  private async choose(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    pick: {
      wait: FilesWait;
      files: readonly KeptFile[];
      chosen: Chosen;
      now: number;
      home?: string;
    },
  ): Promise<void> {
    const { wait, files, chosen, now } = pick;
    const homes = await customerHomes(tx, customerId);
    const asked = await openPapersOf(tx, customerId);
    const found = await targetOf(tx, chosen, asked, homes.length, homes[0]?.propertyId ?? null);
    // The paper is not asked for any more (answered, or cancelled): said, then asked again.
    if (!found) {
      await queueReply(tx, chat, { kind: 'text', body: MEDIA_WORDS.paperGone });
      return this.askAgain(tx, chat, customerId, now);
    }
    const target = found.home === null && pick.home ? { ...found, home: pick.home } : found;
    if (target.home === null && homes.length >= 2)
      return askWhichHome(tx, chat, homes, wait, chosen);
    const place = (target.home && placeOn(homes, target.home, target.category)) || {
      projectId: null,
      propertyId: null,
      category: target.category,
    };
    const { answered } = await fileAs(tx, this.requests, customerId, files, chosen, place, asked);
    const request =
      chosen.kind === 'ask' ? asked.find((one) => one.id === chosen.actionId) : undefined;
    const [first] = files;
    await saySaved(tx, chat, {
      title: savedTitle(request, target),
      home: homes.find((home) => home.propertyId === target.home) ?? null,
      count: files.length,
      firstId: first?.id ?? '',
      left: stillAsked(asked, target, homes.length, answered?.id)[0],
    });
    const ids = files.map((file) => file.id);
    return this.settle(tx, chat, customerId, wait, files, now, withBatch(chat.context, ids, now));
  }

  /** Files left the wait (filed, or sent on): the rest of the burst is asked next. */
  private async settle(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    wait: FilesWait,
    files: readonly KeptFile[],
    now: number,
    filedBatches?: unknown,
  ): Promise<void> {
    const left = withoutFiles(
      wait,
      files.map((file) => file.id),
    );
    // Files that came meanwhile keep their own time; with none scheduled they are asked soon.
    const next = left
      ? {
          ...left,
          pick: null,
          offered: null,
          askAt: left.each ? null : (left.askAt ?? now + this.delay()),
        }
      : null;
    await saveWait(tx, chat, next, filedBatches ? { filedBatches } : {});
    const context = { ...(chat.context as object), filesWait: next };
    // After "They're different", the next file is asked about at once.
    if (next?.each) {
      const [following] = next.files;
      await this.questions.ask(tx, { ...chat, context }, customerId, now, {
        focus: following ? [following.id] : null,
      });
    }
  }

  private delay(): number {
    return this.env.FILE_WAIT_SECONDS * 1000;
  }

  private async askAgain(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    now: number,
    ended = false,
  ): Promise<void> {
    const asked = await this.questions.ask(tx, chat, customerId, now, { focus: null, each: null });
    if (!asked && ended) await this.say(tx, chat, MEDIA_WORDS.paperAskEnded);
  }

  private say(tx: DatabaseExecutor, chat: Conversation, body: string) {
    return queueReply(tx, chat, { kind: 'text', body });
  }
}
