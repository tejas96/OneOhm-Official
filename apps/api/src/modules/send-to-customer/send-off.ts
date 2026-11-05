import type { SendPreview, SendRequest } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  handOverInPerson,
  routeCustomerMessage,
  routeOfCustomer,
} from '@oneohm/database';
import { type ContactChannel, inPersonTask, isNews, type SendPath, sendPath } from '@oneohm/domain';
import type { Environment } from '../../config/environment';
import { payPageUrl } from '../whatsapp/assistant/pay-buttons';
import type { SendContext } from './send-context';
import { previewOf } from './send-deliver';
import { amountWords, offWords } from './send-off-words';
import type { Deps } from './send-papers';
import { dueInstalments } from './send-reads';
import type { Composed } from './send-recorded';

/** How this action reaches the customer, and what is sent or handed over (redesign §17). */
export interface OffPlan {
  readonly route: ContactChannel;
  readonly path: SendPath;
  readonly title: string;
  readonly body: string;
}

/**
 * The plan for a customer not reached by WhatsApp, or null when they are (the chat or the template goes as
 * before). A payment needs a due instalment and online payments on, else it is done in person.
 */
export async function offPlan(
  db: DatabaseExecutor,
  env: Environment,
  ctx: SendContext,
  request: SendRequest,
  composed: Composed,
): Promise<OffPlan | null> {
  const route = await routeOfCustomer(db, ctx.customerId);
  let path = sendPath(request.action, route);
  // News with nothing to answer keeps the usual route: the approved message's SMS, or the handovers list.
  if (path === 'whatsapp' || isNews(request.action)) return null;
  const words = offWords(ctx.language);
  const asked = composed.record.kind === 'action' ? composed.record.title : composed.record.log;
  if (path === 'sms_pay_link') {
    const due = (await dueInstalments(db, ctx)).find(
      (one) => request.action === 'payment_reminder' && one.id === request.milestoneId,
    );
    if (!due || env.RAZORPAY_MODE === 'off') path = 'in_person';
    else {
      const said = words.payLink(
        amountWords(due.leftPaise),
        due.home,
        payPageUrl(env, ctx.customerId, due.id),
      );
      return { route, path, ...said };
    }
  }
  if (path === 'sms_text')
    return { route, path, ...(request.action === 'ask_rating' ? words.rating : words.paper) };
  return { route, path: 'in_person', ...inPersonTask(ctx.customerName, asked) };
}

/** What staff see before sending: the SMS the customer gets, or the task for the team. */
export function offPreview(plan: OffPlan, language: SendPreview['language']): SendPreview {
  const sms = plan.path !== 'in_person';
  return {
    body: sms ? `${plan.title}. ${plan.body}`.trim() : plan.body,
    buttons: [],
    via: sms ? 'sms' : 'in_person',
    language,
    note: sms
      ? 'This customer is not on WhatsApp, so they get this as an SMS.'
      : 'This customer is not on WhatsApp: it becomes a task on the customer handovers list for the team to do in person.',
  };
}

/** Sends the SMS, or puts the task on the handovers list. Returns how it travels. */
export async function deliverOff(
  tx: DatabaseExecutor,
  ctx: SendContext,
  plan: OffPlan,
  key: string,
  projectId: string | null,
): Promise<'sms' | 'in_person'> {
  const words = { title: plan.title, body: plan.body };
  if (plan.path === 'in_person') {
    await handOverInPerson(tx, ctx.customerId, {
      template: 'send_to_customer',
      dedupeKey: key,
      words,
      projectId,
    });
    return 'in_person';
  }
  await routeCustomerMessage(tx, {
    recipient: ctx.phone,
    template: 'send_to_customer',
    payload: {},
    dedupeKey: key,
    words,
  });
  return 'sms';
}

/** The preview staff see: the SMS or the in-person task for a customer off WhatsApp, else the usual one. */
export async function previewFor(
  deps: Deps,
  ctx: SendContext,
  request: SendRequest,
  composed: Composed,
): Promise<SendPreview> {
  const plan = await offPlan(deps.db, deps.env, ctx, request, composed);
  return plan ? offPreview(plan, ctx.language) : previewOf(deps.db, ctx, composed.built);
}
