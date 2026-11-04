import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type DatabaseExecutor, noteBackgroundRun, waConversations } from '@oneohm/database';
import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { customerHomes } from '../../customer-portal/customer-homes';
import { DocumentChecklistService } from '../../reports/document-checklist.service';
import { tellChatTeam } from '../chat-owner';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import { chatLanguage } from './chat-language';
import { ASK_AT_MOST, asked, filesWaitOf, isDue, withoutFiles } from './files-wait';
import { saveWait } from './files-wait-store';
import { inLanguage } from './language';
import { unfiledFiles } from './paper-reads';
import { recentRequest } from './problem-flow';
import { buildQuestion } from './what-question';
import { askedRows, missingRows } from './what-reads';

const EVERY_SECONDS = 2;
/** After this many failures in a row we stop asking and tell staff once. */
const MAX_TRIES = 5;
const BACK_OFF_SECONDS = 30;

/** What the open question is about, and which part of the list it shows. */
export interface AskOptions {
  /** `more` is the list after "Something else": the papers we asked for are left out. */
  readonly stage?: 'first' | 'more';
  /** Ask about these files only (one by one after "They're different"). */
  readonly focus?: readonly string[] | null;
  readonly each?: { readonly of: number } | null;
}

/**
 * Asks "What is this?" about the files waiting in a chat (redesign 5.2). A burst is one
 * question: it goes out 15 seconds after the last file. The time lives in the chat's
 * context, so a restart loses nothing; this service looks for due questions every few
 * seconds (as the onboarding nudge does) and `POST /whatsapp/file-questions/run` runs it by
 * hand with a pretend clock for the acceptance suite. Each chat is handled under its row lock.
 */
@Injectable()
export class FileQuestionsService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('FileQuestions');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly checklists: DocumentChecklistService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.FILE_QUESTION_TIMER === false) return;
    this.timer = setInterval(() => void this.run(), EVERY_SECONDS * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Asks in every chat whose waiting files are due; returns how many chats were asked. */
  async run(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let done = 0;
    try {
      const due = await this.db
        .select({ id: waConversations.id })
        .from(waConversations)
        .where(and(isNotNull(waConversations.filesAskAt), lte(waConversations.filesAskAt, now)))
        .orderBy(asc(waConversations.filesAskAt))
        .limit(50);
      const failed: string[] = [];
      for (const { id } of due) {
        try {
          if (await this.askIfDue(id, now.getTime())) done += 1;
        } catch (error) {
          failed.push(id);
          this.log.error(`File question for chat ${id} failed: ${String(error)}`);
          await this.backOff(id, now).catch(() => undefined);
        }
      }
      if (failed.length > 0)
        await noteBackgroundRun(this.db, 'file_questions', {
          error: new Error(`${failed.length} chats failed (${done} asked): ${failed.join(', ')}`),
        });
      else await noteBackgroundRun(this.db, 'file_questions', { count: done });
    } catch (error) {
      this.log.error(`File questions failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'file_questions', { error });
    } finally {
      this.running = false;
    }
    return done;
  }

  private askIfDue(chatId: string, now: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, chatId);
      const wait = filesWaitOf(chat.context);
      // Nothing to ask (files gone, or a chat with no customer): the time is cleared, so the
      // chat is never picked again; a due time that moved is read again from the context.
      if (!wait || !chat.customerId) {
        await saveWait(tx, chat, wait && { ...wait, askAt: null });
        return false;
      }
      if (!isDue(wait, now)) {
        await saveWait(tx, chat, wait);
        return false;
      }
      const language = await chatLanguage(tx, chat);
      return inLanguage(language, () => this.ask(tx, chat, chat.customerId ?? '', now));
    });
  }

  /**
   * A question that failed is tried again a little later; after a few tries the time is
   * cleared (the files still wait, and the "Files to sort" alert covers them) and the chat's
   * people are told once.
   */
  private async backOff(chatId: string, now: Date): Promise<void> {
    const [row] = await this.db
      .update(waConversations)
      .set({
        filesAskTries: sql`${waConversations.filesAskTries} + 1`,
        filesAskAt: sql`case when ${waConversations.filesAskTries} + 1 >= ${MAX_TRIES} then null
          else ${now.toISOString()}::timestamptz + (${waConversations.filesAskTries} + 1) * ${BACK_OFF_SECONDS} * interval '1 second' end`,
      })
      .where(eq(waConversations.id, chatId))
      .returning();
    if (row && row.filesAskTries >= MAX_TRIES)
      await tellChatTeam(this.db, row, {
        kind: 'whatsapp_file_failed',
        title: 'WhatsApp files not asked about',
        body: `${row.profileName ?? row.phone} sent files we could not ask about. Open the chat and ask what they are.`,
        key: `wa_files_ask_failed:${row.id}:${now.getTime()}`,
      });
  }

  /**
   * Asks about the waiting files: the first ten (or `options.focus`). Files filed meanwhile
   * are dropped first; false when nothing is left to ask. The caller holds the chat's lock.
   */
  async ask(
    tx: DatabaseExecutor,
    chat: Conversation,
    customerId: string,
    now: number,
    options: AskOptions = {},
  ): Promise<boolean> {
    const wait = filesWaitOf(chat.context);
    if (!wait) return false;
    const live = await unfiledFiles(
      tx,
      customerId,
      wait.files.map((file) => file.id),
    );
    const liveIds = live.map((file) => file.id);
    const kept = wait.files.filter((file) => liveIds.includes(file.id));
    const gone = wait.files.map((file) => file.id).filter((id) => !liveIds.includes(id));
    const current = gone.length > 0 ? withoutFiles(wait, gone) : wait;
    if (!current) {
      await saveWait(tx, chat, null);
      return false;
    }
    const chosen = options.focus?.filter((id) => liveIds.includes(id)) ?? [];
    const subject =
      chosen.length > 0
        ? kept.filter((file) => chosen.includes(file.id))
        : kept.slice(0, ASK_AT_MOST);
    const homes = await customerHomes(tx, customerId);
    const stage = options.stage ?? 'first';
    const each =
      options.each === undefined ? (current.each ? { of: current.eachOf } : null) : options.each;
    const { rows } = await askedRows(tx, customerId, homes);
    const missing =
      rows.length === 0 || stage === 'more' ? await missingRows(this.checklists, homes) : [];
    const position = each ? Math.min(each.of, Math.max(1, each.of - kept.length + 1)) : 0;
    const { reply, offered } = buildQuestion({
      count: subject.length,
      photos: subject.every((file) => file.type === 'image'),
      each: each ? { n: position, of: each.of } : null,
      stage,
      asked: rows,
      missing,
      problem: recentRequest(chat.context, now) !== null,
    });
    await queueReply(tx, chat, reply);
    const next = asked(current, now, { focus: subject.map((file) => file.id), offered, each });
    await saveWait(tx, chat, next);
    return true;
  }
}
