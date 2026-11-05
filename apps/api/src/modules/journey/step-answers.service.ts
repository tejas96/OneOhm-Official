import { Inject, Injectable } from '@nestjs/common';
import { customerActions, type Database, homeNameOf } from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { DATABASE, ENVIRONMENT } from '../../config/core.module';
import type { Environment } from '../../config/environment';
import { CustomerDocumentsService } from '../customer-portal/customer-documents.service';
import { CustomerPortalService } from '../customer-portal/customer-portal.service';
import { resolvePaper } from '../send-to-customer/send-papers';
import { sayWithTaps } from '../whatsapp/assistant/closing-taps';
import { HandOverService } from '../whatsapp/assistant/hand-over';
import { type Conversation, queueReply } from '../whatsapp/chat-store';
import { sharedFileUrl } from '../whatsapp/file-links';
import { JOURNEY_WORDS } from './journey-words';
import { answerStep, type StepResult, type StepTap } from './step-answers';
import {
  bankSignAsk,
  creditAsk,
  creditNotYetReply,
  layoutAsk,
  layoutButtons,
  registerAsk,
} from './step-messages';
import { STEP_WORDS } from './step-words';

type Action = typeof customerActions.$inferSelect;

/**
 * What the customer's taps on the subsidy, bank and layout questions do (redesign §4, §18 11, 15):
 * the first button answers and closes, the second sends a person (registration help, a layout
 * question), asks for another day, or keeps the subsidy question open until the money arrives.
 */
@Injectable()
export class StepAnswersService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ENVIRONMENT) private readonly env: Environment,
    private readonly people: HandOverService,
    private readonly portal: CustomerPortalService,
    private readonly documents: CustomerDocumentsService,
  ) {}

  async tapped(chat: Conversation, customerId: string, actionId: string, tap: StepTap) {
    const result = await answerStep(this.db, customerId, actionId, tap);
    const words = STEP_WORDS;
    switch (result.kind) {
      case 'old':
        return void (await queueReply(this.db, chat, { kind: 'text', body: JOURNEY_WORDS.old }));
      case 'notYet':
        return void (await queueReply(this.db, chat, creditNotYetReply(actionId)));
      case 'change':
        return sayWithTaps(this.db, chat, words.bank.change, ['menu']);
      case 'person':
        return this.people.passToOwner(chat, { summary: this.question(result) });
      case 'ok':
        return sayWithTaps(this.db, chat, this.thanks(result), ['menu']);
    }
  }

  private question(result: Extract<StepResult, { kind: 'person' }>): string {
    return result.step === 'layout'
      ? `Question about the layout ${result.paper} they were sent.`
      : 'Needs help to register on the PM Surya Ghar portal.';
  }

  private thanks(result: Extract<StepResult, { kind: 'ok' }>): string {
    const words = STEP_WORDS;
    return {
      subsidy_register: words.register.done,
      subsidy_credit: words.credit.yes,
      bank_sign: words.bank.going(result.day),
      layout: words.layout.ok,
    }[result.step];
  }

  /** The open question again with its buttons (the link of "We need … to continue", Home's [Answer now]). */
  async show(chat: Conversation, action: Action) {
    const id = action.id;
    const payload = action.payload;
    const home = await homeNameOf(this.db, action.projectId);
    const send = (replies: readonly Parameters<typeof queueReply>[2][]) =>
      Promise.all(replies.map((reply) => queueReply(this.db, chat, reply))).then(() => undefined);
    switch (payload.kind) {
      case 'subsidy_register':
        return send(registerAsk('', home, id).replies);
      case 'subsidy_credit':
        return payload.answer === 'not_yet'
          ? send([creditNotYetReply(id)])
          : send(
              creditAsk(
                { customer: '', amount: formatInr(Number(payload.amountPaise ?? 0)), home },
                id,
              ).replies,
            );
      case 'bank_sign':
        return send(
          bankSignAsk(
            {
              customer: '',
              bank: String(payload.bank ?? ''),
              branch: String(payload.branch ?? ''),
              day: String(payload.dayText ?? ''),
            },
            id,
          ).replies,
        );
      default:
        return this.showLayout(chat, action, home);
    }
  }

  /** The layout again with its two buttons; if the file cannot be found, the buttons alone. */
  private async showLayout(chat: Conversation, action: Action, home: string) {
    const deps = { db: this.db, env: this.env, portal: this.portal, documents: this.documents };
    const paper = await resolvePaper(
      deps,
      { customerId: action.customerId },
      String(action.payload.paperId),
    ).catch(() => null);
    const replies = paper
      ? layoutAsk(
          { customer: '', home, paper, link: sharedFileUrl(this.env, paper.file) },
          action.id,
        ).replies
      : [layoutButtons(home, action.id)];
    for (const reply of replies) await queueReply(this.db, chat, reply);
  }
}
