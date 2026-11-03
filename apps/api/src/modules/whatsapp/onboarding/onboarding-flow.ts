import { Inject, Injectable } from '@nestjs/common';
import { readBusinessSetting, waConversations } from '@oneohm/database';
import { nextStep, type OnboardAnswers, type OnboardStep, previousStep } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { HandOverService } from '../assistant/hand-over';
import { assistantLanguage } from '../assistant/language';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { EstimateService } from './estimate.service';
import { EstimateNextStepsService } from './estimate-next-steps';
import { changesName, readAnswer } from './onboarding-answer';
import {
  firstMissing,
  isOnboardingChat,
  onboardState,
  readOnboard,
  stepOfState,
} from './onboarding-context';
import { ChatFilesService, type Fetched } from './onboarding-files';
import { knownFrom, openLeadFor, summaryOf, writeAnswer } from './onboarding-lead';
import { type QuestionView, question } from './onboarding-replies';
import { BACK, speak, type Turn, wantsPerson } from './onboarding-turn';
import { ensureLead, fileHeldBill, takeChatFile } from './onboarding-turn-files';

/**
 * The guided WhatsApp onboarding for a new number (Part 3): language, name, city, site,
 * bill, roof, floors and the bill photo, mostly by taps. The lead is made at the city
 * answer and every later answer writes it at once. "Talk to a person" or two unclear
 * answers in a row hand the chat over with a summary, so a person is always one tap away.
 * Each message is applied under a row lock on the chat, so quick messages take turns.
 */
@Injectable()
export class OnboardingFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly intake: LeadIntakeService,
    private readonly people: HandOverService,
    private readonly estimates: EstimateService,
    private readonly nextSteps: EstimateNextStepsService,
    private readonly files: ChatFilesService,
  ) {}

  /**
   * True when a stranger's message belongs here: a chat onboarding started (it finishes
   * even if onboarding was turned off since), or, when onboarding is on, a number with
   * no open lead. A lead the team made keeps the old stranger replies.
   */
  async takes(chat: Conversation): Promise<boolean> {
    if (isOnboardingChat(chat)) return true;
    const settings = await readBusinessSetting(this.db, 'onboarding');
    return settings.enabled && !(await openLeadFor(this.db, chat.phone));
  }

  /** A photo or paper is downloaded first, so the chat row is not locked during the fetch. */
  async handle(chat: Conversation, incoming: Incoming): Promise<void> {
    return this.run(chat, incoming, false, await this.files.download(incoming.media));
  }

  /** "hi", "menu" or the first message after a release: the question the chat is on. */
  resume(chat: Conversation): Promise<void> {
    return this.run(chat, null);
  }

  /** A friend's referral code made the lead: its name and city stand, so the site is next. */
  fromReferral(chat: Conversation): Promise<void> {
    return this.run(chat, null, true);
  }

  private async run(
    seen: Conversation,
    incoming: Incoming | null,
    referral = false,
    file: Fetched | null = null,
  ) {
    const discard = await this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, seen.id);
      const lead = await openLeadFor(tx, chat.phone);
      const kept = readOnboard(chat);
      // A referral lead's name (and its city, when given) stand; the rest is asked.
      const seeded = referral ? knownFrom(lead) : {};
      const turn: Turn = {
        tx,
        chat,
        lead,
        settings: await readBusinessSetting(tx, 'onboarding'),
        known: {
          ...(chat.language ? { language: assistantLanguage(chat.language) } : {}),
          ...knownFrom(lead),
        },
        answers: { ...kept?.answers, ...seeded },
        misses: kept?.misses ?? 0,
        awaiting: kept?.awaiting,
        pendingFile: kept?.pendingFile,
        file,
        discard: [],
        dropEntry: false,
      };
      // After a referral the first open question after the name is asked straight away.
      if (referral) await this.ask(turn, nextStep('name', turn.answers, turn.known));
      else await this.take(turn, incoming);
      return turn.discard;
    });
    await this.files.discard(discard);
  }

  /** Applies one message, under the chat's row lock. */
  private async take(turn: Turn, incoming: Incoming | null): Promise<null> {
    // A message that waited for the lock behind a hand-over: the person has the chat now.
    if (incoming && turn.chat.state === 'human') return null;
    const onStep = stepOfState(turn.chat.state);
    const current = onStep ?? firstMissing(turn.answers, turn.known);
    if (incoming?.media) return this.takeFile(turn, current);
    if (current === 'done') return this.afterEstimate(turn, incoming);
    if (!incoming) return this.ask(turn, current);
    if (wantsPerson(incoming)) return this.toPerson(turn, current);
    const choice = incoming.choiceId;
    const text = incoming.text.trim();
    const word = text.toLowerCase();
    // Nothing to read: a tap on another question (an older list, the nudge's "Continue"),
    // or words in the first message after a person handed the chat back: ask the question.
    if (choice ? !choice.startsWith(`ob:${current}:`) : !onStep) return this.ask(turn, current);
    // At the name question "change" (बदला, बदलें…) means a new name, not the step before.
    if (!choice && BACK.has(word) && !(current === 'name' && changesName(word))) {
      turn.awaiting = undefined;
      return this.ask(turn, previousStep(current));
    }
    const read = readAnswer(
      current,
      { choiceId: choice, text },
      {
        settings: turn.settings,
        profileName: turn.chat.profileName,
        awaiting: turn.awaiting,
      },
    );
    if (read.kind === 'miss') {
      turn.misses += 1;
      return turn.misses >= 2 ? this.toPerson(turn, current) : this.ask(turn, current, true);
    }
    if (read.kind === 'await') {
      turn.awaiting = read.what;
      return this.ask(turn, current);
    }
    return this.apply(turn, current, read.value);
  }

  /** A photo or paper: at the photo question it is the answer, elsewhere the question stays. */
  private async takeFile(turn: Turn, step: OnboardStep): Promise<null> {
    const outcome = await takeChatFile(turn, this.files, step);
    if (outcome === 'filed' && step === 'photo') return this.apply(turn, 'photo', 'sent');
    return this.ask(turn, step);
  }

  /** A clear answer: kept in the chat, written on the lead, then the next question. */
  private async apply(turn: Turn, step: OnboardStep, answer: unknown): Promise<null> {
    const { tx, chat } = turn;
    turn.answers = { ...turn.answers, [step]: answer } as OnboardAnswers;
    turn.misses = 0;
    turn.awaiting = undefined;
    if (step === 'language')
      await tx
        .update(waConversations)
        .set({ language: String(answer) })
        .where(eq(waConversations.id, chat.id));
    const written = await writeAnswer(tx, this.intake, {
      chat,
      lead: turn.lead,
      step,
      answers: turn.answers,
      settings: turn.settings,
    });
    turn.dropEntry ||= written.created;
    if (written.leadId) await fileHeldBill(turn, this.files, written.leadId);
    const next = nextStep(step, turn.answers, turn.known);
    if (next !== 'done') return this.ask(turn, next);
    // Its lead was closed on the way: a new one, so the estimate or the expert has a lead.
    const leadId =
      written.leadId ??
      (await ensureLead(
        turn,
        { intake: this.intake, files: this.files },
        'Call — finished onboarding',
      ));
    await this.save(turn, 'done');
    const after = { view: this.view(turn), summary: summaryOf(turn.answers, turn.settings) };
    await speak(turn, () => this.estimates.finish(tx, chat, leadId, turn.answers, after));
    return null;
  }

  /** After the estimate its own taps are answered; anything else, typed too, goes to the owner. */
  private async afterEstimate(turn: Turn, incoming: Incoming | null): Promise<null> {
    const { tx, chat, lead } = turn;
    const tap = incoming?.choiceId ?? null;
    const answered = await speak(turn, () => this.nextSteps.answer(tx, chat, lead, tap));
    return answered ? null : this.toPerson(turn, 'done');
  }

  /**
   * A person takes over with the answers summary, in this transaction: the state, the
   * alert and the reply commit together. `ob` keeps this step for when the chat returns.
   */
  private async toPerson(turn: Turn, step: OnboardStep): Promise<null> {
    turn.misses = 0;
    turn.awaiting = undefined;
    await ensureLead(turn, { intake: this.intake, files: this.files });
    await this.save(turn, step);
    const summary = summaryOf(turn.answers, turn.settings);
    await speak(turn, () => this.people.passToOwner(turn.chat, { summary, db: turn.tx }));
    return null;
  }

  private async ask(turn: Turn, step: OnboardStep, retry = false): Promise<null> {
    await this.save(turn, step);
    await speak(turn, () =>
      queueReply(turn.tx, turn.chat, question(step, { ...this.view(turn), retry })),
    );
    return null;
  }

  private async save(turn: Turn, step: OnboardStep): Promise<void> {
    const { entry, ...rest } = turn.chat.context as Record<string, unknown>;
    const { nudgedAt, followedUpAt, startedAt } = readOnboard(turn.chat) ?? {};
    const ob = {
      answers: turn.answers,
      startedAt: startedAt ?? new Date().toISOString(),
      // The one nudge is never sent twice, even after the customer comes back and stalls again.
      ...(nudgedAt ? { nudgedAt } : {}),
      ...(followedUpAt ? { followedUpAt } : {}),
      misses: turn.misses,
      ...(turn.awaiting ? { awaiting: turn.awaiting } : {}),
      ...(turn.pendingFile ? { pendingFile: turn.pendingFile } : {}),
    };
    const context = { ...rest, ...(turn.dropEntry || entry === undefined ? {} : { entry }), ob };
    await turn.tx
      .update(waConversations)
      .set({ state: onboardState(step), context, updatedAt: new Date() })
      .where(eq(waConversations.id, turn.chat.id));
  }

  private view(turn: Turn): QuestionView {
    return {
      settings: turn.settings,
      profileName: turn.chat.profileName,
      awaiting: turn.awaiting,
    };
  }
}
