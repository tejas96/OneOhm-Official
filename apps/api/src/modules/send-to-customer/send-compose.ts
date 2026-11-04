import { randomUUID } from 'node:crypto';
import type { SendRequest } from '@oneohm/api-contracts';
import { conflict, invalid, notFound } from '../../common/http/errors';
import { receiptById } from '../whatsapp/assistant/customer-papers';
import { inLanguage } from '../whatsapp/assistant/language';
import { sharedFileUrl } from '../whatsapp/file-links';
import type { SendContext } from './send-context';
import type { Built } from './send-messages';
import {
  callbackAsk,
  crewContact,
  delayNotice,
  documentMessage,
  locationAsk,
  paymentAsk,
  receiptMessage,
  stageForCustomer,
} from './send-messages';
import { callerName, type Deps, resolvePaper } from './send-papers';
import { crewOf, dueInstalments, homesOf, receiptsOf, waitingTask } from './send-reads';

/** What a send records besides the message: a customer action, or only a log line and audit. */
export type Recorded =
  | {
      readonly kind: 'action';
      readonly id: string;
      readonly type: 'location' | 'pay' | 'callback';
      readonly title: string;
      readonly propertyId: string | null;
      readonly projectId: string | null;
      readonly payload: { [key: string]: unknown };
      readonly log: string;
      /** Asked already (a reminder for an instalment already asked about): no new action. */
      readonly reuse?: string | null;
    }
  | {
      readonly kind: 'log';
      readonly audit: string;
      readonly entity: string;
      readonly entityId: string;
      readonly log: string;
      readonly projectId: string | null;
      readonly data: { [key: string]: unknown };
    };

export interface Composed {
  readonly built: Built;
  readonly record: Recorded;
}

type Request<A extends SendRequest['action']> = Extract<SendRequest, { action: A }>;
type Compose<A extends SendRequest['action']> = (
  deps: Deps,
  ctx: SendContext,
  request: Request<A>,
  id: string,
) => Promise<Composed>;

const logOnly = (
  audit: string,
  entity: string,
  entityId: string,
  log: string,
  data: { [key: string]: unknown } = {},
  projectId: string | null = null,
): Recorded => ({ kind: 'log', audit, entity, entityId, log, projectId, data });

const askLocation: Compose<'ask_location'> = async ({ db }, ctx, request, id) => {
  const home = (await homesOf(db, ctx)).find((one) => one.propertyId === request.propertyId);
  if (!home) throw notFound('That home');
  return {
    built: locationAsk(ctx.customerName, home.home, id),
    record: {
      kind: 'action',
      id,
      type: 'location',
      title: `Location of ${home.home}`,
      propertyId: home.propertyId,
      projectId: home.projectId,
      payload: {},
      log: `Asked the customer to share the location of ${home.home} (WhatsApp)`,
    },
  };
};

const sendDocument: Compose<'send_document'> = async (deps, ctx, request) => {
  const paper = await resolvePaper(deps, ctx, request.paperId);
  const link = sharedFileUrl(deps.env, paper.file);
  return {
    built: documentMessage(ctx.customerName, paper, link),
    record: logOnly(
      'customer.document_sent',
      'customer',
      ctx.customerId,
      `Sent ${paper.caption} to the customer on WhatsApp`,
      { paper: paper.id },
    ),
  };
};

const askPayment: Compose<'payment_reminder' | 'ask_payment_proof'> = async (
  { db, env },
  ctx,
  request,
  id,
) => {
  const due = (await dueInstalments(db, ctx)).find((one) => one.id === request.milestoneId);
  if (!due) throw conflict('That payment is not due any more.', 'not_due');
  const kind = request.action === 'payment_reminder' ? 'reminder' : 'proof';
  return {
    built: paymentAsk(kind, {
      customer: ctx.customerName,
      leftPaise: due.leftPaise,
      home: due.home,
      milestoneId: due.id,
      online: env.RAZORPAY_MODE !== 'off',
    }),
    record: {
      kind: 'action',
      id,
      type: 'pay',
      title: `${due.label} — ${due.home}`,
      propertyId: null,
      projectId: due.projectId,
      payload: { milestoneId: due.id, leftPaise: due.leftPaise },
      log:
        kind === 'reminder'
          ? `Sent a payment reminder for ${due.label}`
          : `Asked for payment proof for ${due.label}`,
    },
  };
};

const sendReceipt: Compose<'send_receipt'> = async ({ db, env }, ctx, request) => {
  const receipt = (await receiptsOf(db, ctx)).find((one) => one.id === request.paymentId);
  const paper = receipt ? await receiptById(db, ctx.customerId, receipt.id) : null;
  if (!receipt || !paper) throw notFound('That receipt');
  const given = {
    customer: ctx.customerName,
    project: receipt.projectCode,
    amountPaise: receipt.amountPaise,
    milestone: receipt.milestone,
    milestoneId: receipt.milestoneId,
  };
  return {
    built: receiptMessage(given, paper, sharedFileUrl(env, paper.file)),
    record: logOnly(
      'customer.receipt_sent',
      'payment',
      receipt.id,
      `Sent receipt ${receipt.number} to the customer on WhatsApp`,
      { receipt: receipt.number },
      receipt.projectId,
    ),
  };
};

const shareCrew: Compose<'share_crew'> = async ({ db }, ctx, request) => {
  const crew = await crewOf(db, ctx);
  const person = crew.find((one) => one.userId === request.userId && one.work === request.work);
  if (!person) throw notFound('That person');
  return {
    built: crewContact(ctx.customerName, person),
    record: logOnly(
      'customer.crew_shared',
      'customer',
      ctx.customerId,
      `Gave the customer ${person.name}'s number for ${person.work}`,
      { userId: person.userId, work: person.work },
    ),
  };
};

const tellDelay: Compose<'delay_notice'> = async ({ db }, ctx, request) => {
  const task = await waitingTask(db, request.taskId);
  if (!task || (ctx.taskId && ctx.taskId !== task.id)) {
    throw conflict('That step is not waiting.', 'not_waiting');
  }
  if (!task.allowed) {
    throw invalid('This step is not set to message customers (Settings → Task templates).');
  }
  return {
    built: delayNotice(ctx.customerName, stageForCustomer(task, ctx.language), request.reason),
    record: logOnly(
      'customer.delay_notice',
      'project_task',
      task.id,
      `Told the customer why ${task.stage ?? 'a step'} is waiting: ${request.reason}`,
      { reason: request.reason },
    ),
  };
};

const askCallback: Compose<'ask_callback'> = async ({ db }, ctx, _request, id) => ({
  built: callbackAsk(ctx.customerName, await callerName(db, ctx), id),
  record: {
    kind: 'action',
    id,
    type: 'callback',
    title: 'Call back',
    propertyId: null,
    projectId: ctx.projectId,
    payload: {},
    log: 'Asked the customer when to call them back (WhatsApp)',
  },
});

/**
 * The message and the record for one request, after checking it against the customer's own
 * data (a home, an instalment or a paper that is not theirs is refused). `id` is the customer
 * action it will make, so the buttons in the message can name it.
 */
export function compose(
  deps: Deps,
  ctx: SendContext,
  request: SendRequest,
  id = randomUUID(),
): Promise<Composed> {
  return inLanguage(ctx.language, () => {
    switch (request.action) {
      case 'ask_location':
        return askLocation(deps, ctx, request, id);
      case 'send_document':
        return sendDocument(deps, ctx, request, id);
      case 'payment_reminder':
      case 'ask_payment_proof':
        return askPayment(deps, ctx, request, id);
      case 'send_receipt':
        return sendReceipt(deps, ctx, request, id);
      case 'share_crew':
        return shareCrew(deps, ctx, request, id);
      case 'delay_notice':
        return tellDelay(deps, ctx, request, id);
      case 'ask_callback':
        return askCallback(deps, ctx, request, id);
    }
  });
}
