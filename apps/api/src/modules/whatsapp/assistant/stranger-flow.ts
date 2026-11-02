import { Inject, Injectable } from '@nestjs/common';
import { brandName } from '@oneohm/database';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { type ChatReply, type Conversation, queueReply } from '../chat-store';
import { HandOverService } from './hand-over';
import { WORDS } from './words';

/**
 * Numbers not saved on any customer (PRD 6.1, 3.3): they see nothing private, only a call
 * back or a person, and a friend's referral code makes them that customer's referral.
 */
@Injectable()
export class StrangerFlowService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly portal: CustomerPortalService,
    private readonly intake: LeadIntakeService,
    private readonly people: HandOverService,
  ) {}

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

  /** A new number with a customer's referral code becomes that customer's referral (PRD 5.6). */
  async referredFriend(chat: Conversation, code: string, word: string): Promise<void> {
    try {
      const saved = await this.portal.referByCode(code, {
        name: chat.profileName?.trim() || 'WhatsApp contact',
        phone: chat.phone,
      });
      if (!saved) return this.answer(chat, word);
      const welcome = WORDS.referredWelcome(saved.referrer, await brandName(this.db));
      return this.say(chat, { kind: 'text', body: welcome });
    } catch (error) {
      if (error instanceof AppError) return this.say(chat, { kind: 'text', body: error.message });
      throw error;
    }
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
    });
    await this.people.toPerson(chat);
    return this.say(chat, { kind: 'text', body: WORDS.callbackNoted });
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
