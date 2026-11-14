import { Inject, Injectable } from '@nestjs/common';
import { customers, leadActivities, leads, readBusinessSetting } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, notInArray } from 'drizzle-orm';
import { AppError } from '../../common/http/errors';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { ensureReferralCode } from '../referrals/referral-codes';
import { loadProgram, whatsappDigits } from '../referrals/referral-program';
import { setStep } from '../whatsapp/assistant/chat-step';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { readReferral } from '../whatsapp/assistant/read-referral';
import { WORDS } from '../whatsapp/assistant/words';
import { businessWhatsAppNumber } from '../whatsapp/business-number';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { linkFormReply } from '../whatsapp/forms/form-record';
import type { IncomingForm } from '../whatsapp/forms/form-reply-data';
import { FormSendService } from '../whatsapp/forms/form-send';
import { referFormStart } from './care-form-words';
import { careTaps } from './care-taps';
import { REFER_WORDS } from './refer-words';

/** A 10-digit Indian mobile from what was typed ("+91 98765 43210", "098765-43210"), or null. */
export function mobileOf(typed: string | undefined): string | null {
  const digits = (typed ?? '').replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** A friend's name: letters, spaces and . ' -, 2 to 60 characters; null when there is none. */
export function nameOf(typed: string | undefined): string | null {
  const name = (typed ?? '')
    .replace(/[^\p{L}\p{M}\s.'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return name.length >= 2 ? name.slice(0, 60) : null;
}

/** The friend a customer typed, waiting for their city. */
interface Friend {
  readonly name: string;
  readonly phone: string;
}

/**
 * Refer a friend on WhatsApp (redesign §15): the form (name, mobile, city) when published, else the friend
 * typed in one message and the city as a tap. The lead is the existing referral lead. The thank-you names the
 * reward from the referral programme and ends with [My rewards] [Share my link].
 */
@Injectable()
export class ReferralChatService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly portal: CustomerPortalService,
    private readonly forms: FormSendService,
  ) {}

  private async cities(): Promise<string[]> {
    return [...(await readBusinessSetting(this.db, 'onboarding')).serviceCities];
  }

  async start(chat: Conversation, customerId: string): Promise<void> {
    const cities = await this.cities();
    if (cities.length > 0 && (await this.forms.available('refer_friend'))) {
      await this.forms.sendForm(
        chat,
        customerId,
        'refer_friend',
        referFormStart(cities, {}),
        WORDS.askReferral,
      );
      return;
    }
    await setStep(this.db, chat, 'await_referral');
    return sayWithTaps(this.db, chat, WORDS.askReferral, ['menu']);
  }

  /** The friend's name and number typed in one message; then the city is asked as a tap. */
  async typed(chat: Conversation, customerId: string, text: string): Promise<void> {
    const friend = readReferral(text);
    if (!friend) return sayWithTaps(this.db, chat, WORDS.referralUnclear, ['menu']);
    return this.askCity(chat, customerId, friend);
  }

  /**
   * The form came back: name, mobile and city are read strictly (the mobile alone: +91 or 0 in front and
   * spaces are fine). Something unusable is said so and a fresh form is offered; the city "Other" is none.
   */
  async fromForm(chat: Conversation, customerId: string, form: IncomingForm): Promise<void> {
    const phone = mobileOf(form.answers.mobile);
    const name = nameOf(form.answers.friend);
    if (!phone || !name) {
      await queueReply(this.db, chat, {
        kind: 'text',
        body: phone ? REFER_WORDS.nameBad : REFER_WORDS.mobileBad,
      });
      return this.start(chat, customerId);
    }
    // A city that is not one we offered ("Other city", a changed list, a forged answer) is not given.
    const city = (await this.cities()).find((one) => one === form.answers.city) ?? null;
    return this.finish(chat, customerId, { name, phone }, city, true);
  }

  private async askCity(chat: Conversation, customerId: string, friend: Friend) {
    const cities = await this.cities();
    if (cities.length === 0) return this.finish(chat, customerId, friend, null);
    await setStep(this.db, chat, 'await_referral', { friend });
    await queueReply(this.db, chat, {
      kind: 'list',
      body: REFER_WORDS.askCity(friend.name.split(/\s+/)[0] ?? friend.name),
      button: REFER_WORDS.pickCity,
      rows: [
        ...cities
          .slice(0, 9)
          .map((city) => ({ id: careTaps.city(city), title: city.slice(0, 24) })),
        { id: careTaps.city('-'), title: REFER_WORDS.otherCity },
      ],
    });
  }

  /** A city row tapped. */
  async city(chat: Conversation, customerId: string, value: string): Promise<void> {
    const friend = (chat.context as { friend?: Friend } | null)?.friend;
    if (!friend) return this.start(chat, customerId);
    return this.finish(chat, customerId, friend, value === '-' ? null : value);
  }

  private async finish(
    chat: Conversation,
    customerId: string,
    friend: Friend,
    city: string | null,
    fromForm = false,
  ) {
    await setStep(this.db, chat, 'menu');
    const refused = await this.refused(customerId, friend.phone);
    if (refused) {
      if (fromForm && refused.leadId)
        await linkFormReply(this.db, chat.id, { kind: 'lead', id: refused.leadId });
      return sayWithTaps(this.db, chat, refused.body, ['menu']);
    }
    try {
      const made = await this.portal.refer(customerId, {
        ...friend,
        ...(city ? { city } : { note: 'City not given.' }),
      });
      if (fromForm) await linkFormReply(this.db, chat.id, { kind: 'lead', id: made.id });
    } catch (error) {
      if (error instanceof AppError && error.code === 'duplicate')
        return sayWithTaps(this.db, chat, WORDS.referralKnown, ['menu']);
      if (error instanceof AppError) return sayWithTaps(this.db, chat, error.message, ['menu']);
      throw error;
    }
    const program = await loadProgram(this.db);
    const reward =
      program.active && program.amountPaise > 0
        ? program.basis === 'per_kw'
          ? REFER_WORDS.perKw(formatInr(program.amountPaise))
          : formatInr(program.amountPaise)
        : null;
    const first = friend.name.split(/\s+/)[0] ?? friend.name;
    return sayWithTaps(this.db, chat, REFER_WORDS.thanks(first, reward), [
      'rewards',
      { id: careTaps.link, title: REFER_WORDS.shareButton },
    ]);
  }

  /** Own number, a number that is already a customer, or already an open lead: said politely, nothing made. */
  private async refused(customerId: string, phone: string) {
    const [self] = await this.db
      .select({ phone: customers.phoneE164, name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    if (self?.phone === phone) return { body: REFER_WORDS.ownNumber, leadId: null };
    const [known] = await this.db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phoneE164, phone));
    if (known) return { body: REFER_WORDS.alreadyCustomer, leadId: null };
    const [open] = await this.db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.phoneE164, phone), notInArray(leads.stage, ['won', 'lost'])));
    if (!open) return null;
    // The lead is not made twice, but the team sees who else sent this number their way.
    await this.db.insert(leadActivities).values({
      leadId: open.id,
      kind: 'note',
      note: `${self?.name ?? 'A customer'} also referred this number on WhatsApp.`,
    });
    return { body: WORDS.referralKnown, leadId: open.id };
  }

  /** [Share my link]: the customer's code with a link a friend can tap to message us. */
  async share(chat: Conversation, customerId: string): Promise<void> {
    const code = await ensureReferralCode(this.db, customerId);
    const program = await loadProgram(this.db);
    const digits = whatsappDigits(
      program.shareNumberE164 ?? (await businessWhatsAppNumber(this.env)),
    );
    const link = digits
      ? `https://wa.me/${digits}?text=${encodeURIComponent(`Hi OneOhm, my friend sent me. Code ${code}`)}`
      : null;
    return sayWithTaps(this.db, chat, REFER_WORDS.shareText(code, link), ['rewards', 'menu']);
  }
}
