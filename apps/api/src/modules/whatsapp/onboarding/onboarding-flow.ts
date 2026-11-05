import { Inject, Injectable } from '@nestjs/common';
import { readBusinessSetting, waConversations } from '@oneohm/database';
import { nextStep, type OnboardAnswers, type OnboardStep } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CHAT_WORDS } from '../assistant/chat-words';
import { HandOverService } from '../assistant/hand-over';
import { type Conversation, lockedChat, queueReply } from '../chat-store';
import type { Incoming } from '../whatsapp-events';
import { EstimateService } from './estimate.service';
import { EstimateNextStepsService } from './estimate-next-steps';
import { MORE_WORDS } from './onboard-words-more';
import { afterEstimate } from './onboarding-after';
import { readAnswer } from './onboarding-answer';
import { CONTINUE_CHOICE, firstMissing, isOnboardingChat, stepOfState } from './onboarding-context';
import { ChatFilesService, type Fetched } from './onboarding-files';
import { openLeadFor, summaryOf, writeAnswer } from './onboarding-lead';
import { notePin, pinnedCity, pinWaits, say } from './onboarding-pin';
import { type QuestionView, question } from './onboarding-replies';
import {
  backTo,
  goesBack,
  newTurn,
  saveTurn,
  speak,
  type Turn,
  wantsPerson,
} from './onboarding-turn';
import {
  ensureLead,
  fileHeldBill,
  type HeardMedia,
  handToPerson,
  heardMedia,
  takeChatFile,
} from './onboarding-turn-files';

/**
 * The guided WhatsApp onboarding for a new number (redesign §16): language, name, city, site, bill, roof,
 * floors and the bill photo by taps, then the estimate. The lead is made at the city answer; a person is one
 * tap away. Each message is applied under a row lock on the chat, so quick messages take turns.
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

  /** A friend's referral code made the lead: its name and city stand; the rest is asked. */
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
      const turn = await newTurn(tx, chat, lead, file, referral);
      if (referral) await this.ask(turn, firstMissing(turn.answers, turn.known));
      else await this.take(turn, incoming);
      return turn.discard;
    });
    await this.files.discard(discard);
  }

  private async take(turn: Turn, incoming: Incoming | null): Promise<null> {
    // A message that waited for the lock behind a hand-over: the person has the chat now.
    if (incoming && turn.chat.state === 'human') return null;
    const onStep = stepOfState(turn.chat.state);
    const current = onStep ?? firstMissing(turn.answers, turn.known);
    // A voice note or a video is a person's to hear (C12); a photo or paper is filed.
    const heard = heardMedia(incoming?.media?.type);
    if (heard) return this.toPerson(turn, current, heard);
    if (incoming?.media) return this.takeFile(turn, current);
    if (current === 'done') return this.afterEstimate(turn, incoming);
    if (!incoming) return this.ask(turn, current);
    if (wantsPerson(incoming)) return this.toPerson(turn, current);
    // A reaction, sticker, card or pin is not an answer: never an unclear one (§16 fixes).
    if (incoming.kind === 'other') return this.other(turn, current, incoming);
    return this.answerStep(turn, current, onStep !== null, incoming);
  }

  /** A tap or typed words for the question the chat is on: Back, an answer, "type it", or an unclear one. */
  private async answerStep(
    turn: Turn,
    current: OnboardStep,
    onStep: boolean,
    incoming: Incoming,
  ): Promise<null> {
    const choice = incoming.choiceId;
    const text = incoming.text.trim();
    if (current === 'city' && choice === 'ob:city:pin') return this.askPin(turn);
    // Nothing to read: a tap on another question (an older list), the nudge's "Continue", or words
    // in the first message after a person handed the chat back. An old tap is told so.
    if (choice ? !choice.startsWith(`ob:${current}:`) : !onStep) {
      if (choice && choice !== CONTINUE_CHOICE) await say(turn, CHAT_WORDS.earlier);
      return this.ask(turn, current);
    }
    if (goesBack(current, choice, text.toLowerCase())) return this.ask(turn, backTo(turn, current));
    const view = {
      settings: turn.settings,
      profileName: turn.chat.profileName,
      awaiting: turn.awaiting,
    };
    const read = readAnswer(current, { choiceId: choice, text }, view);
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
    // After the estimate nobody waits on a question: the next-step buttons are not sent again.
    if (step === 'done') {
      await saveTurn(turn, 'done');
      return null;
    }
    return this.ask(turn, step);
  }

  /** A reaction needs no reply; a pin at the city question is the city; the rest asks the question again. */
  private async other(turn: Turn, step: OnboardStep, incoming: Incoming): Promise<null> {
    if (incoming.quiet) return null;
    if (step === 'city' && incoming.location) {
      const city = pinnedCity(turn, incoming.location);
      if (city) return this.apply(turn, 'city', city);
      await pinWaits(turn);
      return this.ask(turn, 'city');
    }
    return this.ask(turn, step);
  }

  /** [📍 Send location]: WhatsApp's own button (a single-button message). */
  private async askPin(turn: Turn): Promise<null> {
    await saveTurn(turn, 'city');
    await say(turn, MORE_WORDS.locationAsk, true);
    return null;
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
    const leadId = written.leadId ?? turn.lead?.id;
    if (step === 'city' && leadId) await notePin(turn, leadId);
    const next = nextStep(step, turn.answers, turn.known);
    if (next !== 'done') return this.ask(turn, next);
    // Its lead was closed on the way: a new one, so the estimate or the expert has a lead.
    const made =
      leadId ??
      (await ensureLead(
        turn,
        { intake: this.intake, files: this.files },
        'Call — finished onboarding',
      ));
    await saveTurn(turn, 'done');
    const after = { view: this.view(turn), summary: summaryOf(turn.answers, turn.settings) };
    await speak(turn, () => this.estimates.finish(tx, chat, made, turn.answers, after));
    return null;
  }

  /** After the estimate: its own taps, short words, the options again; only real words reach the owner. */
  private afterEstimate(turn: Turn, incoming: Incoming | null): Promise<null> {
    return afterEstimate(turn, incoming, this.nextSteps, {
      toPerson: () => this.toPerson(turn, 'done'),
      ask: () => this.ask(turn, 'done'),
    });
  }

  /** A person takes over with the answers summary (one transaction: state, alert and reply together). */
  private toPerson(turn: Turn, step: OnboardStep, media?: HeardMedia): Promise<null> {
    return handToPerson(turn, step, media, {
      intake: this.intake,
      files: this.files,
      people: this.people,
    });
  }

  private async ask(turn: Turn, step: OnboardStep, retry = false): Promise<null> {
    await saveTurn(turn, step);
    await speak(turn, () =>
      queueReply(turn.tx, turn.chat, question(step, { ...this.view(turn), retry })),
    );
    return null;
  }

  private view(turn: Turn): QuestionView {
    return {
      settings: turn.settings,
      profileName: turn.chat.profileName,
      awaiting: turn.awaiting,
    };
  }
}
