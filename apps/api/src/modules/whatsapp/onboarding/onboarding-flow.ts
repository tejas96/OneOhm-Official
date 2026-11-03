import { Inject, Injectable } from '@nestjs/common';
import { readBusinessSetting, type Transaction, waConversations } from '@oneohm/database';
import {
  asksForPerson,
  nextStep,
  type OnboardAnswers,
  type OnboardingSettings,
  type OnboardStep,
  previousStep,
} from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { HandOverService } from '../assistant/hand-over';
import { assistantLanguage, inLanguage } from '../assistant/language';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { readAnswer } from './onboarding-answer';
import {
  firstMissing,
  isOnboardingChat,
  onboardState,
  PERSON_CHOICE,
  readOnboard,
  stepOfState,
} from './onboarding-context';
import { finishOnboarding } from './onboarding-finish';
import { knownFrom, type OpenLead, openLeadFor, summaryOf, writeAnswer } from './onboarding-lead';
import { type QuestionView, question } from './onboarding-replies';

/** One message being applied, inside the transaction that holds the chat row. */
interface Turn {
  readonly tx: Transaction;
  readonly chat: Conversation;
  readonly settings: OnboardingSettings;
  readonly lead: OpenLead | null;
  readonly known: Partial<OnboardAnswers>;
  answers: OnboardAnswers;
  misses: number;
  awaiting: 'name' | 'city' | undefined;
  /** The lead was made from the saved ad entry, so the chat forgets it. */
  dropEntry: boolean;
}

const BACK = new Set(['back', 'change', 'मागे', 'परत', 'पीछे', 'वापस', 'बदला', 'बदलें']);
/** Taps that hand the chat to a person, including the old stranger buttons. */
const PERSON_TAPS = new Set([PERSON_CHOICE, 'human', 'callback']);
const wantsPerson = (incoming: Incoming) =>
  (incoming.choiceId !== null && PERSON_TAPS.has(incoming.choiceId)) ||
  (incoming.kind === 'text' && asksForPerson(incoming.text));

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

  handle(chat: Conversation, incoming: Incoming): Promise<void> {
    return this.run(chat, incoming);
  }

  /** "hi", "menu" or the first message after a release: the question the chat is on. */
  resume(chat: Conversation): Promise<void> {
    return this.run(chat, null);
  }

  /** A friend's referral code made the lead: its name and city stand, so the site is next. */
  fromReferral(chat: Conversation): Promise<void> {
    return this.run(chat, null, true);
  }

  private async run(seen: Conversation, incoming: Incoming | null, referral = false) {
    const outcome = await this.db.transaction(async (tx) => {
      const chat = await lockedChat(tx, seen.id);
      const lead = await openLeadFor(tx, chat.phone);
      const kept = readOnboard(chat);
      const seeded = referral && lead ? { name: lead.name, city: lead.city } : {};
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
        dropEntry: false,
      };
      // After a referral the next open question after the city is asked straight away.
      const summary = referral
        ? await this.ask(turn, nextStep('city', turn.answers, turn.known))
        : await this.take(turn, incoming);
      return { chat, summary };
    });
    if (outcome.summary !== null) await this.people.passToOwner(outcome.chat, outcome.summary);
  }

  /** Applies one message; returns the staff summary when the chat goes to a person. */
  private async take(turn: Turn, incoming: Incoming | null): Promise<string | null> {
    const onStep = stepOfState(turn.chat.state);
    const current = onStep ?? firstMissing(turn.answers, turn.known);
    if (current === 'done') return this.toPerson(turn, current);
    if (!incoming) return this.ask(turn, current);
    if (wantsPerson(incoming)) return this.toPerson(turn, current);
    const choice = incoming.choiceId;
    const text = incoming.text.trim();
    const word = text.toLowerCase();
    // Nothing to read: a tap on another question (an older list, the nudge's "Continue"),
    // or words in the first message after a person handed the chat back: ask the question.
    if (choice ? !choice.startsWith(`ob:${current}:`) : !onStep) return this.ask(turn, current);
    if (!choice && BACK.has(word) && !(current === 'name' && word === 'change')) {
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
    const next = nextStep(step, turn.answers, turn.known);
    if (next !== 'done') return this.ask(turn, next);
    await this.save(turn, 'done');
    await this.speak(turn, () =>
      finishOnboarding(tx, chat, written.leadId, turn.answers, this.view(turn)),
    );
    return null;
  }

  /** The chat stays on this step for when it comes back; a person gets the summary. */
  private async toPerson(turn: Turn, step: OnboardStep): Promise<string> {
    turn.misses = 0;
    turn.awaiting = undefined;
    await this.save(turn, step);
    return summaryOf(turn.answers, turn.settings);
  }

  private async ask(turn: Turn, step: OnboardStep, retry = false): Promise<null> {
    await this.save(turn, step);
    await this.speak(turn, () =>
      queueReply(turn.tx, turn.chat, question(step, { ...this.view(turn), retry })),
    );
    return null;
  }

  private async save(turn: Turn, step: OnboardStep): Promise<void> {
    const { entry, ...rest } = turn.chat.context as Record<string, unknown>;
    const ob = {
      answers: turn.answers,
      misses: turn.misses,
      ...(turn.awaiting ? { awaiting: turn.awaiting } : {}),
    };
    const context = { ...rest, ...(turn.dropEntry || entry === undefined ? {} : { entry }), ob };
    await turn.tx
      .update(waConversations)
      .set({ state: onboardState(step), context, updatedAt: new Date() })
      .where(eq(waConversations.id, turn.chat.id));
  }

  /** Replies go out in the language chosen, from the moment it is chosen. */
  private speak<T>(turn: Turn, say: () => Promise<T>): Promise<T> {
    return inLanguage(assistantLanguage(turn.answers.language ?? turn.chat.language), say);
  }

  private view(turn: Turn): QuestionView {
    return {
      settings: turn.settings,
      profileName: turn.chat.profileName,
      awaiting: turn.awaiting,
    };
  }
}
