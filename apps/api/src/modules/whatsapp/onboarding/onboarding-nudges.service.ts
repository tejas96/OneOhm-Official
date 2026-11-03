import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { noteBackgroundRun, readBusinessSetting, waConversations } from '@oneohm/database';
import { isWorkingTime, type OnboardingSettings } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, like, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { lockedChat, queueReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { CONTINUE_CHOICE, PERSON_CHOICE, readOnboard, stepOfState } from './onboarding-context';
import { ChatFilesService } from './onboarding-files';
import { openLeadFor } from './onboarding-lead';
import { speak, type Turn } from './onboarding-turn';
import { ensureLead } from './onboarding-turn-files';

const EVERY_MINUTES = 5;
const HOUR = 3_600_000;
/** A chat with no lead gets one after this many silent hours, even with nudges off. */
const LEAD_AFTER_HOURS = 3;
/** The nudge is a session message, so it only goes inside WhatsApp's free 24 hours. */
const WINDOW_HOURS = 24;

/**
 * One gentle nudge when a customer stops halfway through the WhatsApp onboarding, and the
 * "no silent paths" rule: a chat that stalls before a lead exists gets one, with a call
 * for today, so sales always follows up. Runs in the API every 5 minutes (the clock is a
 * parameter, so tests choose the time). Each chat is handled under its row lock.
 */
@Injectable()
export class OnboardingNudgesService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger('OnboardingNudges');
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly intake: LeadIntakeService,
    private readonly files: ChatFilesService,
  ) {}

  onApplicationBootstrap(): void {
    if (this.env.ONBOARDING_NUDGE_TIMER === false) return;
    this.timer = setInterval(() => void this.run(), EVERY_MINUTES * 60_000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many customers were nudged and how many leads were made. */
  async run(now: Date = new Date()): Promise<{ nudged: number; leads: number }> {
    const done = { nudged: 0, leads: 0 };
    if (this.running) return done;
    this.running = true;
    try {
      const settings = await readBusinessSetting(this.db, 'onboarding');
      const leadCut = new Date(
        now.getTime() - Math.max(settings.nudgeAfterHours, LEAD_AFTER_HOURS) * HOUR,
      );
      const window = new Date(now.getTime() - WINDOW_HOURS * HOUR);
      // Stalled onboarding chats not yet nudged, still in the window or with no lead yet.
      const stalled = await this.db
        .select({ id: waConversations.id })
        .from(waConversations)
        .where(
          and(
            like(waConversations.state, 'onboard:%'),
            ne(waConversations.state, 'onboard:done'),
            sql`${waConversations.lastInboundAt} <= ${leadCut}`,
            sql`${waConversations.context}->'ob'->>'nudgedAt' is null`,
            sql`(${waConversations.lastInboundAt} > ${window} or not exists (
              select 1 from leads where leads.phone_e164 = ${waConversations.phone}
                and leads.stage not in ('won', 'lost')))`,
          ),
        );
      for (const { id } of stalled) {
        try {
          const outcome = await this.stalledChat(id, now, settings);
          if (outcome.nudged) done.nudged += 1;
          if (outcome.lead) done.leads += 1;
        } catch (error) {
          this.log.error(
            `Nudge for chat ${id} failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      await noteBackgroundRun(this.db, 'onboarding_nudges', { count: done.nudged + done.leads });
    } catch (error) {
      this.log.error(`Onboarding nudges failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'onboarding_nudges', { error });
    } finally {
      this.running = false;
    }
    return done;
  }

  /** One chat: a lead if it has none, then the nudge when it is on, in hours and in the window. */
  private async stalledChat(id: string, now: Date, settings: OnboardingSettings) {
    const zone = this.env.BUSINESS_TIMEZONE;
    const discard: string[] = [];
    const outcome = await this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, id);
      const step = stepOfState(chat.state);
      const kept = readOnboard(chat);
      const silent = chat.lastInboundAt ? now.getTime() - chat.lastInboundAt.getTime() : 0;
      // Re-checked under the lock: the customer may have written back since the list was read.
      if (!step || step === 'done' || kept?.nudgedAt || silent < LEAD_AFTER_HOURS * HOUR)
        return { nudged: false, lead: false };
      const note = `Call — stopped at ${step} question`;
      const lead = await openLeadFor(tx, chat.phone);
      const turn: Turn = {
        tx,
        chat,
        lead,
        settings,
        known: {},
        file: null,
        discard,
        answers: kept?.answers ?? {},
        misses: kept?.misses ?? 0,
        awaiting: kept?.awaiting,
        pendingFile: kept?.pendingFile,
        dropEntry: false,
      };
      if (!lead) await ensureLead(turn, { intake: this.intake, files: this.files }, note);
      const nudge =
        settings.nudgeAfterHours > 0 &&
        silent >= settings.nudgeAfterHours * HOUR &&
        silent < WINDOW_HOURS * HOUR &&
        isWorkingTime(now, zone);
      if (nudge && lead)
        await updateLeadFromChat(
          tx,
          lead.id,
          { nextAction: { on: todayIn(zone, now), note } },
          `Customer stopped at the ${step} question; nudged on WhatsApp`,
        );
      if (nudge)
        await speak(turn, () =>
          queueReply(
            tx,
            chat,
            {
              kind: 'buttons',
              body: ONBOARD_WORDS.nudge,
              buttons: [
                { id: CONTINUE_CHOICE, title: ONBOARD_WORDS.continue },
                { id: PERSON_CHOICE, title: ONBOARD_WORDS.talkToPerson },
              ],
            },
            null,
            `ob_nudge:${chat.id}`,
          ),
        );
      if (!lead || nudge) await this.save(turn, nudge ? now : null);
      return { nudged: nudge, lead: !lead };
    });
    await this.files.discard(discard);
    return outcome;
  }

  /** Keeps the answers (a held bill may now be filed), the nudge time, and forgets the ad entry. */
  private async save(turn: Turn, nudgedAt: Date | null): Promise<void> {
    const { entry, ...rest } = (turn.chat.context ?? {}) as Record<string, unknown>;
    const { pendingFile: _held, ...ob } = readOnboard(turn.chat) ?? { answers: {}, misses: 0 };
    const context = {
      ...rest,
      ...(turn.dropEntry || entry === undefined ? {} : { entry }),
      ob: {
        ...ob,
        answers: turn.answers,
        ...(turn.pendingFile ? { pendingFile: turn.pendingFile } : {}),
        ...(nudgedAt ? { nudgedAt: nudgedAt.toISOString() } : {}),
      },
    };
    await turn.tx
      .update(waConversations)
      .set({ context, updatedAt: new Date() })
      .where(eq(waConversations.id, turn.chat.id));
  }
}
