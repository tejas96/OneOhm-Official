import { Inject, Injectable } from '@nestjs/common';
import { type DatabaseExecutor, documents, waMessages } from '@oneohm/database';
import { eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { CustomerDocumentRequestsService } from '../../customer-portal/customer-document-requests.service';
import { customerHomes } from '../../customer-portal/customer-homes';
import { DocumentMoveService } from '../../documents/document-move.service';
import { type Conversation, lockedChat, queueReply, setState } from '../chat-store';
import { sayWithTaps } from './closing-taps';
import { startComplaint } from './complaint-start';
import { fileAs } from './file-as';
import { FileQuestionsService } from './file-questions';
import {
  type Chosen,
  type FilesWait,
  filedBatchesOf,
  filesWaitOf,
  isOldQuestion,
  type WhatTap,
  whereTap,
  withBatch,
  withoutFiles,
} from './files-wait';
import { type KeptFile, placeOn } from './kept-files';
import { keepPending, type PendingMedia } from './media-intake';
import { openPapersOf, unfiledFiles } from './paper-reads';
import { takePaymentProof } from './payment-proof';
import { PROJECT_WORDS } from './project-words';
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
  ) {}

  /** A tap on the question, or on a Saved reply. */
  tapped(chat: Conversation, customerId: string, tap: WhatTap): Promise<void> {
    return this.db.transaction(async (tx) => {
      const locked = await lockedChat(tx, chat.id);
      const now = Date.now();
      if (tap.t === 'change') return this.change(tx, locked, customerId, tap.first, now);
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
      if (tap.t === 'more')
        return void (await this.questions.ask(tx, locked, customerId, now, { stage: 'more' }));
      if (tap.t === 'diff') {
        const [first] = files;
        const each = { of: files.length };
        return void (await this.questions.ask(tx, locked, customerId, now, {
          focus: first ? [first.id] : null,
          each,
        }));
      }
      if (tap.t === 'prob') return this.problem(tx, locked, customerId, wait, files, now);
      if (tap.t === 'pay') {
        await takePaymentProof(tx, customerId, files, now);
        await sayWithTaps(tx, locked, WHAT_WORDS.payment, ['menu']);
        return this.settle(tx, locked, customerId, wait, files, now);
      }
      const chosen = this.chosenBy(tap, wait);
      if (!chosen) return this.askAgain(tx, locked, customerId, now);
      return this.choose(tx, locked, customerId, { wait, files, chosen, now });
    });
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
        return this.askHome(tx, locked, homes, wait, wait.pick);
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
      return this.askHome(tx, chat, homes, wait, chosen);
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
    const delay = this.env.FILE_WAIT_SECONDS * 1000;
    const next = left
      ? {
          ...left,
          pick: null,
          offered: null,
          askAt: left.each ? null : (left.askAt ?? now + delay),
        }
      : null;
    const context = {
      ...(chat.context as object),
      filesWait: next,
      ...(filedBatches ? { filedBatches } : {}),
    };
    await setState(tx, chat.id, chat.state, context);
    // After "They're different", the next file is asked about at once.
    if (next?.each) {
      const [following] = next.files;
      await this.questions.ask(tx, { ...chat, context }, customerId, now, {
        focus: following ? [following.id] : null,
      });
    }
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

  private async askHome(
    tx: DatabaseExecutor,
    chat: Conversation,
    homes: Awaited<ReturnType<typeof customerHomes>>,
    wait: FilesWait,
    chosen: Chosen,
  ): Promise<void> {
    await queueReply(tx, chat, {
      kind: 'list',
      body: WHAT_WORDS.whichHome,
      button: WHAT_WORDS.choose,
      rows: homes.slice(0, 10).map((home) => ({
        id: whereTap(home.propertyId),
        title: home.title,
        description: home.description,
      })),
    });
    const context = { ...(chat.context as object), filesWait: { ...wait, pick: chosen } };
    await setState(tx, chat.id, chat.state, context);
  }

  /** "Problem photo": the photos wait for the problem's words, as "Report a problem" asks. */
  private async problem(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    wait: FilesWait,
    files: readonly KeptFile[],
    now: number,
  ): Promise<void> {
    const ids = files.map((file) => file.id);
    const photos: PendingMedia[] = wait.files
      .filter((file) => ids.includes(file.id))
      .map((file) => ({
        type: file.type,
        id: file.media,
        mimeType: null,
        fileName: null,
        at: now,
      }));
    const left = withoutFiles(wait, ids);
    const before = keepPending(chat.context, now).pending as PendingMedia[] | undefined;
    const context = {
      ...(chat.context as object),
      filesWait: left,
      pending: [...(before ?? []), ...photos].slice(-6),
    };
    await setState(tx, chat.id, chat.state, context);
    await startComplaint(tx, { ...chat, context }, customerId);
  }

  /** [Change]: the batch goes back to "not filed" and the customer is asked again. */
  private async change(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    firstId: string,
    now: number,
  ): Promise<void> {
    const batches = filedBatchesOf(chat.context, now);
    const batch = batches.find((one) => one.ids[0] === firstId);
    const released = batch ? await this.moves.release(tx, customerId, batch.ids) : [];
    if (!batch || released.length === 0)
      return sayWithTaps(tx, chat, WHAT_WORDS.changeLate, ['talk', 'menu']);
    const rows = await tx
      .select({ id: documents.id, type: documents.contentType, media: waMessages.mediaId })
      .from(documents)
      .innerJoin(waMessages, eq(waMessages.documentId, documents.id))
      .where(inArray(documents.id, released));
    const back = rows.flatMap((row) =>
      row.media && row.id
        ? [
            {
              id: row.id,
              media: row.media,
              type: row.type.startsWith('image/') ? ('image' as const) : ('document' as const),
              at: now,
            },
          ]
        : [],
    );
    const before = filesWaitOf(chat.context);
    const wait: FilesWait = {
      files: [...(before?.files ?? []).filter((file) => !released.includes(file.id)), ...back],
      askAt: null,
      askedAt: null,
      focus: null,
      each: false,
      eachOf: 0,
      offered: null,
      pick: null,
    };
    const context = {
      ...(chat.context as object),
      filesWait: wait,
      filedBatches: batches.filter((one) => one !== batch),
    };
    await setState(tx, chat.id, chat.state, context);
    await this.questions.ask(tx, { ...chat, context }, customerId, now);
  }

  private say(tx: DatabaseExecutor, chat: Conversation, body: string) {
    return queueReply(tx, chat, { kind: 'text', body });
  }
}
