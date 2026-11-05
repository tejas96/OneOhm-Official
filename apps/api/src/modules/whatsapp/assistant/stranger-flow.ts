import { Inject, Injectable } from '@nestjs/common';
import { brandName, readBusinessSetting } from '@oneohm/database';
import { asksForPerson, findReferralCode, usableName } from '@oneohm/domain';
import { titleCaseName } from '@oneohm/shared';
import { AppError } from '../../../common/http/errors';
import { DATABASE, type Database } from '../../../config/core.module';
import { tellLeadOwner } from '../../crm/lead-history';
import { LeadIntakeService } from '../../crm/lead-intake.service';
import { CustomerPortalService } from '../../customer-portal/customer-portal.service';
import { answererName, ensureChatOwner } from '../chat-owner';
import { type ChatReply, type Conversation, queueReply, setState } from '../chat-store';
import { MORE_WORDS } from '../onboarding/onboard-words-more';
import { isOnboardingChat } from '../onboarding/onboarding-context';
import { ChatFilesService, fileWords } from '../onboarding/onboarding-files';
import { OnboardingFlowService } from '../onboarding/onboarding-flow';
import { openLeadFor } from '../onboarding/onboarding-lead';
import { HEARD, heardReply } from '../onboarding/onboarding-turn-files';
import type { Incoming, IncomingMedia } from '../whatsapp-events';
import { fitTitle } from './chat-words';
import { sayWithTaps } from './closing-taps';
import { clearEntry, savedEntry } from './entry-capture';
import { HandOverService } from './hand-over';
import { MEDIA_WORDS, WORDS } from './words';

const QUICK_ESTIMATE = 'ob:quick';

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
    private readonly files: ChatFilesService,
  ) {}

  /** A stranger's message, after hellos and while no person has the chat. */
  async route(chat: Conversation, incoming: Incoming, word: string): Promise<void> {
    const code = isOnboardingChat(chat) ? null : findReferralCode(incoming.text);
    if (code && (await this.referredFriend(chat, code))) return;
    if (await this.onboarding.takes(chat)) return this.onboarding.handle(chat, incoming);
    // [Quick estimate] under the hello to a lead the team made: the same questions, on that lead.
    if (incoming.choiceId === QUICK_ESTIMATE && (await openLeadFor(this.db, chat.phone)))
      return this.onboarding.resume(chat);
    if (incoming.media && (await this.fileOnLead(chat, incoming.media))) return;
    // Sent from the customer app's "WhatsApp your contact" button: straight to a person.
    if (incoming.kind === 'text' && asksForPerson(incoming.text)) return this.answer(chat, 'human');
    // Typed words, a pin or a card from a lead the team made reach that lead's person (menu audit M13).
    if (
      (incoming.kind === 'text' || incoming.kind === 'other') &&
      (await openLeadFor(this.db, chat.phone))
    )
      return this.people.passToOwner(
        chat,
        incoming.kind === 'other' ? { summary: incoming.text } : {},
      );
    return this.answer(chat, word);
  }

  /**
   * A photo or paper from a number with an open lead the team made: filed on that lead;
   * a voice note or a video goes to their person.
   * False when there is no lead, so a stranger with none still stores nothing.
   */
  private async fileOnLead(chat: Conversation, media: IncomingMedia): Promise<boolean> {
    // Onboarding is off: a bill or a voice note from a new number still makes a lead, so it is kept.
    const lead =
      (await openLeadFor(this.db, chat.phone)) ?? (await this.leadFor(chat, 'sent a file'));
    // A voice note or a video goes warmly to their person, as in onboarding (C12).
    if (media.type === 'audio' || media.type === 'video') {
      const owned = await ensureChatOwner(this.db, chat);
      const reply = heardReply(media.type, await this.people.answererName(owned));
      await this.people.passToOwner(owned, { summary: HEARD[media.type].note, reply });
      return true;
    }
    const file = await this.files.download(media);
    const got = await this.db.transaction((tx) =>
      this.files.receive(tx, file, { id: chat.id, leadId: lead.id }),
    );
    // The lead's owner hears of a filed bill; with no owner, the chat's person does.
    if (got.outcome === 'filed') {
      const owner = lead.ownerUserId ?? (await ensureChatOwner(this.db, chat)).assignedUserId;
      if (owner)
        await tellLeadOwner(this.db, owner, { ...lead }, 'WhatsApp', {
          title: 'New bill on WhatsApp',
          body: `${lead.name}, ${lead.city}. A new bill is filed on the lead.`,
        });
    }
    const body = got.outcome === 'filed' ? MORE_WORDS.fileKept : fileWords(got.outcome);
    // The "can't read it" words name the "Talk to a person" tap, so send that tap with them.
    await this.say(
      chat,
      got.outcome === 'unreadable'
        ? { kind: 'buttons', body, buttons: [{ id: 'human', title: MEDIA_WORDS.talkToPerson }] }
        : { kind: 'text', body },
    );
    return true;
  }

  /** "hi" or "menu": the onboarding question the chat is on, or the old buttons. */
  async greet(chat: Conversation): Promise<void> {
    if (await this.onboarding.takes(chat)) return this.onboarding.resume(chat);
    await setState(this.db, chat.id, 'menu');
    const lead = await openLeadFor(this.db, chat.phone);
    return lead ? this.leadHello(chat, lead.name) : this.answer(chat, '');
  }

  /** A lead the team made says "hi": their person is named, never "not linked to any customer". */
  private async leadHello(chat: Conversation, leadName: string) {
    const owner = await answererName(this.db, await ensureChatOwner(this.db, chat));
    const name = usableName(leadName) ?? usableName(chat.profileName);
    await this.say(chat, {
      kind: 'buttons',
      body: MORE_WORDS.leadHello(name ? titleCaseName(name.split(' ')[0] ?? name) : 'there', owner),
      buttons: [
        { id: 'human', title: fitTitle(MORE_WORDS.talkTo(owner), 20) },
        { id: QUICK_ESTIMATE, title: MORE_WORDS.quickEstimate },
      ],
    });
  }

  /** Numbers we do not know see nothing private: a call back, or a person. */
  async answer(chat: Conversation, word: string): Promise<void> {
    if (word === 'callback') return this.callBack(chat);
    // An onboarding "Talk to a person" tap counts while a person has the chat (it is not swallowed).
    if (word === 'human' || word === 'ob:person') return this.talkToPerson(chat);
    await this.say(chat, {
      kind: 'buttons',
      body: WORDS.unknownNumber,
      buttons: [
        { id: 'callback', title: WORDS.callMeBack },
        { id: 'human', title: MEDIA_WORDS.talkToPerson },
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
        name: usableName(chat.profileName) ?? 'WhatsApp contact',
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

  /** A new number asking for a person is a lead (or its open lead is updated), then the person is told. */
  private async talkToPerson(chat: Conversation) {
    const lead = await openLeadFor(this.db, chat.phone);
    if (lead) await this.people.passToOwner(chat);
    else {
      await this.leadFor(chat, 'asked for a person');
      await this.people.handOver(chat, 'leads.manage');
    }
  }

  /** The open lead for this number, made now when there is none (name only when it can be used). */
  private async leadFor(chat: Conversation, what: string) {
    const open = await openLeadFor(this.db, chat.phone);
    if (open) return open;
    await this.intake.receive({
      name: usableName(chat.profileName) ?? 'WhatsApp contact',
      phone: chat.phone,
      city: 'Not given',
      source: 'whatsapp',
      nextActionNote: `Call — ${what} on WhatsApp`,
      firstNote: `Contacted us on WhatsApp: ${what}.`,
      attribution: savedEntry(chat),
    });
    await clearEntry(this.db, chat);
    const made = await openLeadFor(this.db, chat.phone);
    if (!made) throw new Error('The WhatsApp lead was not made.');
    return made;
  }

  /**
   * An unknown number asking for a call becomes a WhatsApp lead (PRD 3.3) with an owner by
   * rule, who gets the alert; an open lead on the number gets a nudge instead.
   */
  private async callBack(chat: Conversation) {
    await this.intake.receive({
      name: usableName(chat.profileName) ?? 'WhatsApp contact',
      phone: chat.phone,
      city: 'Not given',
      source: 'whatsapp',
      nextActionNote: 'Call back: asked on WhatsApp',
      firstNote: 'Asked for a call back on WhatsApp.',
      attribution: savedEntry(chat),
    });
    await clearEntry(this.db, chat);
    await this.people.toPerson(chat);
    return sayWithTaps(this.db, chat, WORDS.callbackNoted, ['menu']);
  }

  private say(chat: Conversation, reply: ChatReply) {
    return queueReply(this.db, chat, reply);
  }
}
