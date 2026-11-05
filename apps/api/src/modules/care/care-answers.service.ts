import { Inject, Injectable } from '@nestjs/common';
import { customerActions } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { DATABASE, type Database, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { ProblemFlowService } from '../whatsapp/assistant/problem-flow';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { AmcRenewalService } from './amc-renewal.service';
import { type CareTap, careTaps } from './care-taps';
import { answerFixed } from './fixed-check';
import { PROBLEM_WORDS } from './problem-words';
import { askRating } from './rating-ask';
import { RatingsService } from './ratings.service';
import { ReferralChatService } from './referral-chat.service';
import { UpiService } from './upi.service';

/**
 * What the customer's taps do in the care flows (redesign §12, §13, §15): the problem questions, the
 * rating list, "Is it working now?", the referral city and link, and the UPI ask.
 */
@Injectable()
export class CareAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly problems: ProblemFlowService,
    private readonly ratings: RatingsService,
    private readonly referrals: ReferralChatService,
    private readonly upi: UpiService,
    private readonly amc: AmcRenewalService,
  ) {}

  tapped(chat: Conversation, customerId: string, tap: CareTap): Promise<void> {
    switch (tap.t) {
      case 'what':
      case 'since':
      case 'done':
        return this.problems.tapped(chat, customerId, tap);
      case 'rateGo':
      case 'rate':
        return this.ratings.tapped(chat, customerId, tap);
      case 'fixed':
        return this.fixed(chat, customerId, tap.id, tap.working);
      case 'fixedShow':
        return this.showFixed(chat, customerId, tap.id);
      case 'city':
        return this.referrals.city(chat, customerId, tap.value);
      case 'link':
        return this.referrals.share(chat, customerId);
      case 'upi':
        return this.upi.start(chat, customerId, tap.id);
      case 'amc':
        return this.amc.tapped(chat, customerId, tap.id, tap.renew);
    }
  }

  /** Home's [Answer now]: the question again, with its two buttons, while it is still open. */
  private async showFixed(chat: Conversation, customerId: string, id: string) {
    const [ask] = await this.db
      .select()
      .from(customerActions)
      .where(and(eq(customerActions.id, id), eq(customerActions.customerId, customerId)));
    if (ask?.status !== 'open') return sayWithTaps(this.db, chat, PROBLEM_WORDS.fixedOld, ['menu']);
    return queueReply(this.db, chat, {
      kind: 'buttons',
      body: PROBLEM_WORDS.fixed(String(ask.payload.topic ?? '')),
      buttons: [
        { id: careTaps.fixedYes(id), title: PROBLEM_WORDS.yes },
        { id: careTaps.fixedNo(id), title: PROBLEM_WORDS.still },
      ],
    });
  }

  /** "Is it working now?": Yes opens the rating; Still a problem reopens it with a promised call. */
  private async fixed(chat: Conversation, customerId: string, id: string, working: boolean) {
    const result = await answerFixed(this.db, customerId, id, working, {
      timeZone: this.env.BUSINESS_TIMEZONE,
      phone: chat.phone,
    });
    if (result.kind === 'old') return sayWithTaps(this.db, chat, PROBLEM_WORDS.fixedOld, ['menu']);
    if (result.kind === 'ok') {
      await this.db.transaction((tx) =>
        askRating(tx, { kind: 'problem', requestId: result.requestId }, { chat }),
      );
      return;
    }
    return sayWithTaps(
      this.db,
      chat,
      PROBLEM_WORDS.reopened(result.name ?? PROBLEM_WORDS.team, result.when),
      ['problems', 'menu'],
    );
  }
}
