import { titleCaseName } from '@oneohm/shared';
import type { Built } from '../send-to-customer/send-messages';
import type { Paper } from '../whatsapp/assistant/customer-papers';
import type { ChatReply } from '../whatsapp/chat-reply';
import { stepAltTap, stepNowTap, stepOkTap } from './journey-taps';
import { STEP_WORDS } from './step-words';

/**
 * The subsidy, bank and layout questions as the customer reads them: the chat message for inside the
 * 24-hour window and the template (with its quick-reply payloads) for outside it. Build them inside the
 * customer's language, as the other "Send to customer" messages are.
 */
const first = (name: string) => titleCaseName(name);
const button = (id: string, title: string) => ({ id, title });

/** "Please register on the PM Surya Ghar portal for your {home} solar" [Done] [Need help]. */
export function registerAsk(customer: string, home: string, actionId: string): Built {
  const words = STEP_WORDS;
  return {
    replies: [
      {
        kind: 'buttons',
        body: words.register.ask(home),
        buttons: [
          button(stepOkTap(actionId), words.buttons.done),
          button(stepAltTap(actionId), words.buttons.needHelp),
        ],
      },
    ],
    template: {
      key: 'subsidy_register_help',
      payload: {
        customer: first(customer),
        home,
        donePayload: stepOkTap(actionId),
        helpPayload: stepAltTap(actionId),
      },
    },
  };
}

/** "Did ₹78,000 subsidy reach your bank account?" [Yes, received] [Not yet]. */
export function creditAsk(
  given: { customer: string; amount: string; home: string },
  actionId: string,
): Built {
  const words = STEP_WORDS;
  return {
    replies: [
      {
        kind: 'buttons',
        body: words.credit.ask(given.amount, given.home),
        buttons: [
          button(stepOkTap(actionId), words.buttons.received),
          button(stepAltTap(actionId), words.buttons.notYet),
        ],
      },
    ],
    template: {
      key: 'subsidy_credit_check',
      payload: {
        customer: first(given.customer),
        amount: given.amount,
        home: given.home,
        yesPayload: stepOkTap(actionId),
        notYetPayload: stepAltTap(actionId),
      },
    },
  };
}

/** The answer to [Not yet] on the subsidy: noted, with [It has arrived] for later. */
export const creditNotYetReply = (actionId: string): ChatReply => ({
  kind: 'buttons',
  body: STEP_WORDS.credit.notYet,
  buttons: [button(stepNowTap(actionId), STEP_WORDS.buttons.arrived)],
});

/** "Please visit {bank}, {branch} on {day} to sign the loan papers" [I'll go] [Change day]. */
export function bankSignAsk(
  given: { customer: string; bank: string; branch: string; day: string },
  actionId: string,
): Built {
  const words = STEP_WORDS;
  return {
    replies: [
      {
        kind: 'buttons',
        body: words.bank.ask(given.bank, given.branch, given.day),
        buttons: [
          button(stepOkTap(actionId), words.buttons.going),
          button(stepAltTap(actionId), words.buttons.changeDay),
        ],
      },
    ],
    template: {
      key: 'bank_sign_visit',
      payload: {
        customer: first(given.customer),
        bank: given.bank,
        branch: given.branch,
        day: given.day,
        goPayload: stepOkTap(actionId),
        changePayload: stepAltTap(actionId),
      },
    },
  };
}

/** "Here is how the panels will sit on your {home} roof." [Looks good] [I have a question]. */
export const layoutButtons = (home: string, actionId: string): ChatReply => ({
  kind: 'buttons',
  body: STEP_WORDS.layout.ask(home),
  buttons: [
    button(stepOkTap(actionId), STEP_WORDS.buttons.looksGood),
    button(stepAltTap(actionId), STEP_WORDS.buttons.question),
  ],
});

/** The layout itself, then its two buttons. */
export function layoutAsk(
  given: { customer: string; paper: Paper; home: string; link: string },
  actionId: string,
): Built {
  const { paper, home, link } = given;
  return {
    replies: [
      { kind: 'document', link, filename: paper.filename, caption: paper.caption },
      layoutButtons(home, actionId),
    ],
    template: {
      key: 'layout_approval',
      payload: {
        customer: first(given.customer),
        home,
        documentUrl: link,
        documentName: paper.filename,
        okPayload: stepOkTap(actionId),
        questionPayload: stepAltTap(actionId),
      },
    },
  };
}
