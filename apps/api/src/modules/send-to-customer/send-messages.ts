import { localValues } from '@oneohm/database';
import type { CallbackSlot } from '@oneohm/domain';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import type { Paper } from '../whatsapp/assistant/customer-papers';
import type { ChatReply } from '../whatsapp/chat-reply';
import { SEND_LISTS, SEND_WORDS } from './send-words';

/**
 * One message the team sends, as the customer reads it: the chat messages for inside the
 * 24-hour window, and the template (with its quick-reply payloads) for outside it. Built in
 * the customer's language (the caller runs it inside `inLanguage`). The preview and the send
 * both come from here, so staff see exactly what goes.
 */
export interface Built {
  readonly replies: readonly ChatReply[];
  readonly template: { readonly key: string; readonly payload: Record<string, string> };
}

const first = (name: string) => titleCaseName(name);

export function locationAsk(customer: string, home: string, actionId: string): Built {
  return {
    replies: [{ kind: 'location_request', body: SEND_WORDS.location.ask(home) }],
    template: {
      key: 'location_request',
      payload: { customer: first(customer), home, locationPayload: `locreq:${actionId}` },
    },
  };
}

/** A payment reminder (Pay + I paid another way) or the ask for proof (the second button only). */
export function paymentAsk(
  kind: 'reminder' | 'proof',
  given: {
    customer: string;
    leftPaise: number;
    home: string;
    milestoneId: string;
    online: boolean;
  },
): Built {
  const amount = formatInr(given.leftPaise);
  const paidOther = { id: `paidother:${given.milestoneId}`, title: SEND_WORDS.buttons.paidOther };
  const pay = { id: `pay:${given.milestoneId}`, title: CHAT_WORDS.pay(amount) };
  const reminder = kind === 'reminder';
  return {
    replies: [
      {
        kind: 'buttons',
        body: reminder
          ? SEND_WORDS.pay.due(amount, given.home)
          : SEND_WORDS.pay.askProof(amount, given.home),
        buttons: reminder && given.online ? [pay, paidOther] : [paidOther],
      },
    ],
    template: {
      key: 'payment_due',
      payload: {
        customer: first(given.customer),
        amount,
        home: given.home,
        // Without online payments [Pay now] shows the Payments answer, never a pay link.
        payPayload: given.online ? pay.id : 'go:payments',
        paidPayload: paidOther.id,
      },
    },
  };
}

/** A paper of ours sent as the file with its one-line caption. */
export function documentMessage(customer: string, paper: Paper, link: string): Built {
  return {
    replies: [{ kind: 'document', link, filename: paper.filename, caption: paper.caption }],
    template: {
      key: 'document_share',
      payload: {
        customer: first(customer),
        document: paper.title,
        documentUrl: link,
        documentName: paper.filename,
      },
    },
  };
}

/** A receipt again: the existing receipt template with its file outside the window. */
export function receiptMessage(
  given: {
    customer: string;
    project: string;
    amountPaise: number;
    milestone: string;
    milestoneId: string;
  },
  paper: Paper,
  link: string,
): Built {
  return {
    replies: [{ kind: 'document', link, filename: paper.filename, caption: paper.caption }],
    template: {
      key: 'payment_received',
      payload: {
        customer: first(given.customer),
        project: given.project,
        amount: formatInr(given.amountPaise),
        milestone: given.milestone,
        milestoneId: given.milestoneId,
        documentUrl: link,
        documentName: paper.filename,
      },
    },
  };
}

export function crewContact(
  customer: string,
  crew: { name: string; work: string; phone: string },
): Built {
  const name = crew.name.trim().split(/\s+/)[0] ?? crew.name;
  return {
    replies: [{ kind: 'text', body: SEND_WORDS.crew(name, crew.work, crew.phone) }],
    template: {
      key: 'crew_contact',
      payload: { customer: first(customer), staff: name, work: crew.work, phone: crew.phone },
    },
  };
}

export function delayNotice(customer: string, stage: string, reason: string): Built {
  // The reason ends in a full stop in the message; one is never doubled.
  const said = reason
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?।]+$/u, '');
  return {
    replies: [{ kind: 'text', body: SEND_WORDS.delay(stage, said) }],
    template: { key: 'delay_notice', payload: { customer: first(customer), stage, reason: said } },
  };
}

/** The slot buttons and the tap ids that carry the action and the slot. */
export const callbackTap = (actionId: string, slot: CallbackSlot) => `cb:${actionId}:${slot}`;

export function callbackAsk(customer: string, name: string, actionId: string): Built {
  const buttons = SEND_WORDS.buttons;
  return {
    replies: [
      {
        kind: 'buttons',
        body: SEND_WORDS.callback.ask(name),
        buttons: [
          { id: callbackTap(actionId, 'morning'), title: buttons.morning },
          { id: callbackTap(actionId, 'afternoon'), title: buttons.afternoon },
          { id: callbackTap(actionId, 'evening'), title: buttons.evening },
        ],
      },
    ],
    template: {
      key: 'callback_request',
      payload: {
        customer: first(customer),
        staff: name,
        morningPayload: callbackTap(actionId, 'morning'),
        afternoonPayload: callbackTap(actionId, 'afternoon'),
        eveningPayload: callbackTap(actionId, 'evening'),
      },
    },
  };
}

/**
 * The step as the customer reads it: the owner's customer title or the standard step name, said in
 * Marathi or Hindi where we have those words; with none, "work on your project" in their language
 * (never English inside a Marathi or Hindi message). Call it inside the customer's language.
 */
export function stageForCustomer(
  task: { readonly stage: string | null; readonly templateKey: string },
  language: 'en' | 'mr' | 'hi',
): string {
  if (!task.stage) return SEND_LISTS[language].stageFallback;
  if (language === 'en') return task.stage;
  const said = localValues(`${language}-IN`, 'project_milestone', {
    milestone: task.stage,
    step: task.templateKey,
  });
  return said.milestone ?? task.stage;
}
