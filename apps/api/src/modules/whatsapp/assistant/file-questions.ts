import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { type DatabaseExecutor, waConversations } from '@oneohm/database';
import { sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { customerHomes } from '../../customer-portal/customer-homes';
import { DocumentChecklistService } from '../../reports/document-checklist.service';
import { type Conversation, lockedChat, queueReply, setState } from '../chat-store';
import { chatLanguage } from './chat-language';
import { asked, type FilesWait, filesWaitOf, isDue, withoutFiles } from './files-wait';
import { inLanguage } from './language';
import { unfiledFiles } from './paper-reads';
import { buildQuestion } from './what-question';
import { askedRows, missingRows } from './what-reads';

const EVERY_SECONDS = 2;

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
        .where(
          sql`(${waConversations.context} -> 'filesWait' ->> 'askAt')::bigint <= ${now.getTime()}`,
        )
        .limit(50);
      for (const { id } of due) {
        try {
          if (await this.askIfDue(id, now.getTime())) done += 1;
        } catch (error) {
          this.log.error(`File question for chat ${id} failed: ${String(error)}`);
        }
      }
    } finally {
      this.running = false;
    }
    return done;
  }

  private askIfDue(chatId: string, now: number): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, chatId);
      const wait = filesWaitOf(chat.context);
      if (!wait || !chat.customerId || !isDue(wait, now)) return false;
      const language = await chatLanguage(tx, chat);
      return inLanguage(language, () => this.ask(tx, chat, chat.customerId ?? '', now));
    });
  }

  /**
   * Asks about the waiting files (or the focused ones). Files filed meanwhile are dropped
   * first; false when nothing is left to ask. The caller holds the chat's lock.
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
      await this.save(tx, chat, null);
      return false;
    }
    const focus = (options.focus ?? current.focus)?.filter((id) => liveIds.includes(id)) ?? [];
    const subject = focus.length > 0 ? kept.filter((file) => focus.includes(file.id)) : kept;
    const homes = await customerHomes(tx, customerId);
    const stage = options.stage ?? 'first';
    const each =
      options.each === undefined ? (current.each ? { of: current.eachOf } : null) : options.each;
    const { rows } = await askedRows(tx, customerId, homes);
    const missing =
      rows.length === 0 || stage === 'more' ? await missingRows(this.checklists, homes) : [];
    const position = each ? Math.max(1, each.of - kept.length + 1) : 0;
    const { reply, offered } = buildQuestion({
      count: subject.length,
      photos: subject.every((file) => file.type === 'image'),
      each: each ? { n: position, of: each.of } : null,
      stage,
      asked: rows,
      missing,
    });
    await queueReply(tx, chat, reply);
    const next = asked(current, now, {
      focus: focus.length > 0 ? focus : null,
      offered,
      each,
    });
    await this.save(tx, chat, next);
    return true;
  }

  private save(tx: DatabaseExecutor, chat: Conversation, wait: FilesWait | null) {
    return setState(tx, chat.id, chat.state, { ...(chat.context as object), filesWait: wait });
  }
}
