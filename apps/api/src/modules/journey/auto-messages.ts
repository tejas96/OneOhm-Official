import {
  customerActions,
  customers,
  type DatabaseExecutor,
  homeNameOf,
  messageTemplates,
  noticeCustomer,
  queueCustomerMessage,
} from '@oneohm/database';
import { templateIsOn } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { and, asc, eq } from 'drizzle-orm';
import { languageOfPhone } from '../documents/document-request-messages';
import { chatOpenFor } from '../send-to-customer/send-context';
import { dueInstalments } from '../send-to-customer/send-reads';
import { CHAT_WORDS } from '../whatsapp/assistant/chat-words';
import { inLanguage } from '../whatsapp/assistant/language';
import { plainDate } from '../whatsapp/assistant/plain-date';
import type { ChatReply } from '../whatsapp/chat-reply';
import { conversationForPhone, queueReply } from '../whatsapp/chat-store';
import { confirmNoun } from './confirm-words';
import { showTap } from './journey-taps';
import { JOURNEY_WORDS } from './journey-words';

/** The project a step message is about, and the person it goes to. */
export interface StepProject {
  readonly id: string;
  readonly customerId: string;
}
interface Person {
  readonly phone: string;
}

/**
 * Whether the chat message may go: the window is open, the customer has not opted out and the message
 * is switched on in Settings (the worker's rule for the template, so the two never disagree).
 */
export async function mayChat(
  tx: DatabaseExecutor,
  phone: string,
  template: string,
): Promise<boolean> {
  if (!(await chatOpenFor(tx, phone))) return false;
  const [row] = await tx
    .select({ active: messageTemplates.active })
    .from(messageTemplates)
    .where(eq(messageTemplates.key, template))
    .limit(1);
  if (!templateIsOn(template, row)) return false;
  const [customer] = await tx
    .select({ optIn: customers.whatsappOptIn })
    .from(customers)
    .where(eq(customers.phoneE164, phone))
    .limit(1);
  return customer?.optIn !== false;
}

/**
 * One automatic message (redesign §19): inside the 24-hour window the chat message with its buttons
 * (and the same news in the app inbox); outside it the approved template as before, whose newer
 * version may carry the same buttons as quick replies (behind its own switch in Settings).
 */
export async function send(
  tx: DatabaseExecutor,
  person: Person,
  message: {
    readonly template: string;
    readonly payload: Record<string, string>;
    readonly key: string;
    readonly reply: () => Promise<ChatReply>;
  },
): Promise<'chat' | 'template'> {
  if (!(await mayChat(tx, person.phone, message.template))) {
    await queueCustomerMessage(tx, person.phone, message.template, message.payload, message.key);
    return 'template';
  }
  const chat = await conversationForPhone(tx, person.phone);
  const language = await languageOfPhone(tx, person.phone);
  const reply = await inLanguage(language, message.reply);
  await queueReply(tx, chat, reply, null, message.key);
  await noticeCustomer(tx, person.phone, message.template, message.payload, message.key);
  return 'chat';
}

/**
 * Installation started and switch-on carry buttons: [Project update]; [Pay ₹X] when the final
 * instalment is due, else [Warranty & AMC]. False for any other message (the caller sends it as before).
 */
export async function tellStepWithButtons(
  tx: DatabaseExecutor,
  messageKey: string,
  project: StepProject,
  person: Person,
  payload: Record<string, string>,
  key: string,
): Promise<boolean> {
  const words = JOURNEY_WORDS;
  const home = () => homeNameOf(tx, project.id);
  if (messageKey === 'installation_started') {
    await send(tx, person, {
      template: messageKey,
      payload: { ...payload, updatePayload: 'go:update' },
      key,
      reply: async () => ({
        kind: 'buttons',
        body: words.auto.installStarted(await home()),
        buttons: [{ id: 'go:update', title: words.buttons.update }],
      }),
    });
    return true;
  }
  if (messageKey !== 'commissioning_completed') return false;
  const [due] = await dueInstalments(tx, { customerId: project.customerId, projectId: project.id });
  await send(tx, person, {
    template: messageKey,
    // The template has both buttons; with nothing due [Pay now] opens the Payments answer.
    payload: {
      ...payload,
      payPayload: due ? `pay:${due.id}` : 'go:payments',
      warrantyPayload: 'go:warranty',
    },
    key,
    reply: async () => {
      const amount = due ? formatInr(due.leftPaise) : null;
      const warranty = { id: 'go:warranty', title: words.buttons.warranty };
      return {
        kind: 'buttons',
        body: words.auto.switchedOn(await home(), amount),
        buttons: due
          ? [{ id: `pay:${due.id}`, title: CHAT_WORDS.pay(amount ?? '') }, warranty]
          : [warranty],
      };
    },
  });
  return true;
}

const SENDABLE = ['paper', 'location', 'pay', 'signature', 'confirm'] as const;

/** The oldest open ask this step waits for, and the tap that opens it. */
async function openAskOf(tx: DatabaseExecutor, taskId: string) {
  const [ask] = await tx
    .select()
    .from(customerActions)
    .where(and(eq(customerActions.taskId, taskId), eq(customerActions.status, 'open')))
    .orderBy(asc(customerActions.createdAt))
    .limit(1);
  if (!ask || !(SENDABLE as readonly string[]).includes(ask.type)) return null;
  const milestone = String(ask.payload.milestoneId ?? '');
  const tap =
    ask.type === 'paper'
      ? `sendit:${ask.id}`
      : ask.type === 'location'
        ? `locreq:${ask.id}`
        : ask.type === 'pay'
          ? milestone && `pay:${milestone}`
          : showTap(ask.id);
  return tap ? { ask, tap } : null;
}

/**
 * A step now waits on someone outside OneOhm (redesign §19). On the customer: "We need {item} to
 * continue." with [Send it now] opening the open ask (paper, location, payment, a paper to sign, a
 * question) — free text only when there is none. On the bank or the electricity board: one info line.
 */
export async function tellWaitingWithButtons(
  tx: DatabaseExecutor,
  given: {
    readonly taskId: string;
    readonly party: string;
    readonly project: StepProject;
    readonly phone: string;
    readonly payload: Record<string, string>;
    readonly key: string;
    readonly since: Date;
  },
): Promise<void> {
  const { party, phone } = given;
  const link = party === 'customer' ? await openAskOf(tx, given.taskId) : null;
  const payload = { ...given.payload, ...(link ? { sendPayload: link.tap } : {}) };
  await send(
    tx,
    { phone },
    {
      template: 'project_waiting',
      payload,
      key: given.key,
      reply: async () => {
        const words = JOURNEY_WORDS;
        if (party !== 'customer') {
          const who = words.auto.parties[party as 'bank' | 'discom'];
          return {
            kind: 'text',
            body: words.auto.waitingOn(who, plainDate(given.since.toISOString().slice(0, 10))),
          };
        }
        // Waiting on the customer with no ask to open: say what the step is.
        if (!link)
          return { kind: 'text', body: words.auto.waitingYou(given.payload.milestone ?? '') };
        const left = link.ask.payload.leftPaise;
        const title =
          link.ask.type === 'pay' && typeof left === 'number'
            ? CHAT_WORDS.pay(formatInr(left))
            : link.ask.type === 'confirm'
              ? words.buttons.answerNow
              : words.buttons.sendNow;
        return {
          kind: 'buttons',
          body: words.auto.needs(askNoun(link.ask)),
          buttons: [{ id: link.tap, title }],
        };
      },
    },
  );
}

/** What an ask is called in "We need … to continue": a friendly noun for a question or a paper to sign. */
function askNoun(ask: { type: string; title: string; payload: Record<string, unknown> }): string {
  const nouns = JOURNEY_WORDS.nouns;
  if (ask.type === 'confirm') return confirmNoun(String(ask.payload.kind ?? ''));
  if (ask.type === 'signature') return nouns.sign(String(ask.payload.paperTitle ?? ask.title));
  return ask.title;
}
