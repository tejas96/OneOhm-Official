import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import {
  customers,
  noteBackgroundRun,
  readBusinessSetting,
  type Transaction,
  waConversations,
} from '@oneohm/database';
import { isWorkingTime, type OnboardingSettings } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, isNull, like, ne, sql } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../../config/core.module';
import type { Environment } from '../../../config/environment';
import { updateLeadFromChat } from '../../crm/lead-from-chat';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { lockedChat, queueReply } from '../chat-store';
import { ONBOARD_WORDS } from './onboard-words';
import { CONTINUE_CHOICE, PERSON_CHOICE, readOnboard, stepOfState } from './onboarding-context';
import { ChatFilesService } from './onboarding-files';
import { openLeadFor } from './onboarding-lead';
import {
  due,
  GIVE_UP_HOURS,
  HOUR,
  LEAD_AFTER_HOURS,
  leadOfThisOnboarding,
  nudgeTurn,
  PER_TICK,
  WINDOW_HOURS,
} from './onboarding-nudge-rules';
import { speak, type Turn } from './onboarding-turn';
import { ensureLead } from './onboarding-turn-files';

const EVERY_MINUTES = 5;

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

  /**
   * Returns how many customers were nudged and how many leads were made. A chat that fails
   * is skipped (the others go on) and the run is recorded as failed, naming the chats.
   */
  async run(now: Date = new Date()): Promise<{ nudged: number; leads: number }> {
    const done = { nudged: 0, leads: 0 };
    if (this.running) return done;
    this.running = true;
    try {
      const settings = await readBusinessSetting(this.db, 'onboarding');
      const failed: string[] = [];
      for (const id of await this.stalled(now, settings)) {
        try {
          const outcome = await this.stalledChat(id, now, settings);
          if (outcome.nudged) done.nudged += 1;
          if (outcome.lead) done.leads += 1;
        } catch (error) {
          failed.push(id);
          this.log.error(
            `Nudge for chat ${id} failed: ${error instanceof Error ? error.message : error}`,
          );
        }
      }
      if (failed.length > 0)
        await noteBackgroundRun(this.db, 'onboarding_nudges', {
          error: new Error(
            `${failed.length} chats failed (${done.nudged + done.leads} done): ${failed.join(', ')}`,
          ),
        });
      else
        await noteBackgroundRun(this.db, 'onboarding_nudges', { count: done.nudged + done.leads });
    } catch (error) {
      this.log.error(`Onboarding nudges failed: ${error instanceof Error ? error.message : error}`);
      await noteBackgroundRun(this.db, 'onboarding_nudges', { error });
    } finally {
      this.running = false;
    }
    return done;
  }

  /**
   * The chats worth locking: onboarding chats, silent under 7 days, not a customer and not
   * followed up, that either have no lead from this onboarding (the lead rule) or have an open lead and
   * are due the nudge now. Night and nudges-off ticks therefore lock nothing for a lead.
   */
  private async stalled(now: Date, settings: OnboardingSettings): Promise<string[]> {
    const ago = (hours: number) => new Date(now.getTime() - hours * HOUR);
    const silentAt = waConversations.lastInboundAt;
    const nudgeDue =
      settings.nudgeAfterHours > 0 && isWorkingTime(now, this.env.BUSINESS_TIMEZONE)
        ? sql`or (${waConversations.context}->'ob'->>'nudgedAt' is null
              and ${silentAt} <= ${ago(settings.nudgeAfterHours)} and ${silentAt} > ${ago(WINDOW_HOURS)}
              and exists (select 1 from leads where leads.phone_e164 = ${waConversations.phone}
                and leads.stage not in ('won', 'lost')))`
        : sql``;
    const rows = await this.db
      .select({ id: waConversations.id })
      .from(waConversations)
      .where(
        and(
          like(waConversations.state, 'onboard:%'),
          ne(waConversations.state, 'onboard:done'),
          isNull(waConversations.customerId),
          sql`${silentAt} > ${ago(GIVE_UP_HOURS)}`,
          sql`not exists (select 1 from customers where customers.phone_e164 = ${waConversations.phone})`,
          sql`${waConversations.context}->'ob'->>'followedUpAt' is null`,
          sql`((${silentAt} <= ${ago(Math.max(settings.nudgeAfterHours, LEAD_AFTER_HOURS))}
              and not exists (select 1 from leads where leads.phone_e164 = ${waConversations.phone}
                and (leads.stage not in ('won', 'lost')
                  or leads.created_at >= (${waConversations.context}->'ob'->>'startedAt')::timestamptz))) ${nudgeDue})`,
        ),
      )
      .orderBy(asc(silentAt))
      .limit(PER_TICK);
    return rows.map((row) => row.id);
  }

  /** One chat, under its lock: a lead if it has none at all, then the nudge when due. */
  private async stalledChat(id: string, now: Date, settings: OnboardingSettings) {
    const zone = this.env.BUSINESS_TIMEZONE;
    const discard: string[] = [];
    const outcome = await this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, id);
      const step = stepOfState(chat.state);
      const kept = readOnboard(chat);
      const none = { nudged: false, lead: false };
      const silent = chat.lastInboundAt ? now.getTime() - chat.lastInboundAt.getTime() : 0;
      if (!step || step === 'done' || chat.customerId || silent >= GIVE_UP_HOURS * HOUR)
        return none;
      if (await this.isCustomer(tx, chat.phone)) return none;
      const note = `Call — stopped at ${step} question`;
      const lead = await openLeadFor(tx, chat.phone);
      const here = await leadOfThisOnboarding(tx, chat.phone, kept?.startedAt);
      const { makeLead, nudge } = due({
        settings,
        silent,
        now,
        zone,
        kept,
        hasLead: lead !== null,
        hadLead: here,
      });
      if (!makeLead && !nudge) return none;
      const turn = nudgeTurn({ tx, chat, lead, settings, discard });
      if (makeLead) await ensureLead(turn, { intake: this.intake, files: this.files }, note);
      if (nudge && lead)
        await updateLeadFromChat(
          tx,
          lead.id,
          { nextAction: { on: todayIn(zone, now), note } },
          `Customer stopped at the ${step} question; nudged on WhatsApp`,
        );
      if (nudge) await this.askToContinue(turn);
      await this.save(turn, now, nudge);
      return { nudged: nudge, lead: makeLead };
    });
    await this.files.discard(discard);
    return outcome;
  }

  /** A number that is already a customer is not a prospect to chase. */
  private async isCustomer(tx: Transaction, phone: string): Promise<boolean> {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phoneE164, phone))
      .limit(1);
    return customer !== undefined;
  }

  /** The one nudge, in the customer's language; the dedupe key makes a second one impossible. */
  private askToContinue(turn: Turn): Promise<void> {
    return speak(turn, () =>
      queueReply(
        turn.tx,
        turn.chat,
        {
          kind: 'buttons',
          body: ONBOARD_WORDS.nudge,
          buttons: [
            { id: CONTINUE_CHOICE, title: ONBOARD_WORDS.continue },
            { id: PERSON_CHOICE, title: ONBOARD_WORDS.talkToPerson },
          ],
        },
        null,
        `ob_nudge:${turn.chat.id}`,
      ),
    );
  }

  /** Keeps the answers (a held bill may now be filed), the nudge time, and forgets the ad entry. */
  private async save(turn: Turn, now: Date, nudged: boolean): Promise<void> {
    const { entry, ...rest } = (turn.chat.context ?? {}) as Record<string, unknown>;
    const { pendingFile: _held, ...ob } = readOnboard(turn.chat) ?? { answers: {}, misses: 0 };
    const context = {
      ...rest,
      ...(turn.dropEntry || entry === undefined ? {} : { entry }),
      ob: {
        ...ob,
        answers: turn.answers,
        ...(turn.pendingFile ? { pendingFile: turn.pendingFile } : {}),
        followedUpAt: now.toISOString(),
        ...(nudged ? { nudgedAt: now.toISOString() } : {}),
      },
    };
    await turn.tx
      .update(waConversations)
      .set({ context, updatedAt: new Date() })
      .where(eq(waConversations.id, turn.chat.id));
  }
}
