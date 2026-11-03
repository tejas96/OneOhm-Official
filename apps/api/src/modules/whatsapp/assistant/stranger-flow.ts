import { Inject, Injectable } from '@nestjs/common';
import { brandName, readBusinessSetting } from '@oneohm/database';
import { asksForPerson, findReferralCode } from '@oneohm/domain';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import { isOnboardingChat } from '../onboarding/onboarding-context';
import { OnboardingFlowService } from '../onboarding/onboarding-flow';
import type { Incoming } from '../whatsapp-events';
import { clearEntry, savedEntry } from './entry-capture';
import { HandOverService } from './hand-over';
import { WORDS } from './words';

/**
 * Numbers not saved on any customer (PRD 6.1, 3.3): they see nothing private. A new
 * number is onboarded (Part 3) when onboarding is on; otherwise, and for a lead the team
 * made, a call back or a person. A friend's referral code makes them that customer's
 * referral.
 */
@Injectable()
export class StrangerFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly portal: CustomerPortalService,
    private readonly intake: LeadIntakeService,
    private readonly people: HandOverService,
    private readonly onboarding: OnboardingFlowService,
  ) {}

  /** A stranger's message, after hellos and while no person has the chat. */
  async route(chat: Conversation, incoming: Incoming, word: string): Promise<void> {
    const code = isOnboardingChat(chat) ? null : findReferralCode(incoming.text);
    if (code && (await this.referredFriend(chat, code))) return;
    if (await this.onboarding.takes(chat)) return this.onboarding.handle(chat, incoming);
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text)) return this.answer(chat, 'human');
    return this.answer(chat, word);
  }

  /** "hi" or "menu": the onboarding question the chat is on, or the old buttons. */
  async greet(chat: Conversation): Promise<void> {
    if (await this.onboarding.takes(chat)) return this.onboarding.resume(chat);
    await setState(this.db, chat.id, 'menu');
    return this.answer(chat, '');
  }

  /** Numbers we do not know see nothing private: a call back, or a person. */
  async answer(chat: Conversation, word: string): Promise<void> {
    if (word === 'callback') return this.callBack(chat);
    if (word === 'human') return this.people.handOver(chat, 'leads.manage');
    await this.say(chat, {
      kind: 'buttons',
      body: WORDS.unknownNumber,
      buttons: [
        { id: 'callback', title: WORDS.callMeBack },
        { id: 'human', title: 'Talk to a person' },
      ],
    });
  }

  /**
   * A new number with a customer's referral code becomes that customer's referral (PRD
   * 5.6), then onboarding (when on) asks about the site. False for an unknown code.
   */
  private async referredFriend(chat: Conversation, code: string): Promise<boolean> {
    try {
      const saved = await this.portal.referByCode(code, {
        name: chat.profileName?.trim() || 'WhatsApp contact',
        phone: chat.phone,
        attribution: savedEntry(chat),
      });
      if (!saved) return false;
      await clearEntry(this.db, chat);
      const welcome = WORDS.referredWelcome(saved.referrer, await brandName(this.db));
      await this.say(chat, { kind: 'text', body: welcome });
      if ((await readBusinessSetting(this.db, 'onboarding')).enabled)
        await this.onboarding.fromReferral(chat);
    } catch (error) {
      if (!(error instanceof AppError)) throw error;
      await this.say(chat, { kind: 'text', body: error.message });
    }
    return true;
  }

  /**
   * An unknown number asking for a call becomes a WhatsApp lead (PRD 3.3) with an owner by
   * rule, who gets the alert; an open lead on the number gets a nudge instead.
   */
  private async callBack(chat: Conversation) {
    await this.intake.receive({
      name: chat.profileName?.trim() || 'WhatsApp contact',
      phone: chat.phone,
      city: 'Not given',
      source: 'whatsapp',
      nextActionNote: 'Call back: asked on WhatsApp',
      firstNote: 'Asked for a call back on WhatsApp.',
      attribution: savedEntry(chat),
    });
    await clearEntry(this.db, chat);
    await this.people.toPerson(chat);
    return this.say(chat, { kind: 'text', body: WORDS.callbackNoted });
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
