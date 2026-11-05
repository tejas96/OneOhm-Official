import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import type { SendAction } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { journeyOffers } from '../journey/journey-offers';
import { stepOffers } from '../journey/step-offers';
import { visitAskRequests } from '../visits/visit-ask';
import { targetOf } from '../visits/visit-reads';
import { workWords } from '../visits/visit-words';
import { customerPapers } from '../whatsapp/assistant/customer-papers';
import { compose } from './send-compose';
import type { SendContext } from './send-context';
import { previewOf } from './send-deliver';
import type { Deps } from './send-papers';
import { crewOf, dueInstalments, homesOf, receiptsOf, waitingTask } from './send-reads';

/** The offers one action makes at this place: one per home, instalment, paper, receipt or person. */
export async function offersFor(
  deps: Deps,
  ctx: SendContext,
  action: SendAction,
): Promise<SendOffer[]> {
  const { db } = deps;
  const make = async (
    key: string,
    label: string,
    detail: string,
    request: SendRequest,
  ): Promise<SendOffer> => {
    const { built } = await compose(deps, ctx, request);
    return {
      key,
      action: request.action,
      label,
      detail,
      request,
      input: null,
      preview: await previewOf(db, ctx, built),
    };
  };
  switch (action) {
    case 'ask_location':
      return Promise.all(
        (await homesOf(db, ctx)).map((home) =>
          make(
            `loc:${home.propertyId}`,
            `Ask for the location of ${home.home}`,
            home.located
              ? 'This home has a location: a pin from the customer is kept as a suggestion to check.'
              : 'This home has no location yet.',
            {
              action: 'ask_location',
              propertyId: home.propertyId,
            },
          ),
        ),
      );
    case 'send_document': {
      const papers = await customerPapers(
        { db: db, portal: deps.portal, documents: deps.documents },
        ctx.customerId,
      );
      return Promise.all(
        papers.slice(0, 8).map((paper) =>
          make(paper.id, `Send ${paper.title}`, paper.description ?? paper.caption, {
            action: 'send_document',
            paperId: paper.id,
          }),
        ),
      );
    }
    case 'payment_reminder':
    case 'ask_payment_proof': {
      const reminder = action === 'payment_reminder';
      return Promise.all(
        (await dueInstalments(db, ctx)).map((due) =>
          make(
            `${action}:${due.id}`,
            `${reminder ? 'Payment reminder' : 'Ask for payment proof'}: ${formatInr(due.leftPaise)}`,
            `${due.label} — ${due.home}`,
            reminder
              ? { action: 'payment_reminder', milestoneId: due.id }
              : { action: 'ask_payment_proof', milestoneId: due.id },
          ),
        ),
      );
    }
    case 'send_receipt':
      return Promise.all(
        (await receiptsOf(db, ctx)).map((receipt) =>
          make(
            `receipt:${receipt.id}`,
            `Send receipt ${receipt.number}`,
            `${formatInr(receipt.amountPaise)} — ${receipt.milestone}`,
            {
              action: 'send_receipt',
              paymentId: receipt.id,
            },
          ),
        ),
      );
    case 'share_crew':
      return Promise.all(
        (await crewOf(db, ctx)).map((person) =>
          make(
            `crew:${person.userId}:${person.work}`,
            `Share ${person.name}'s contact`,
            `For: ${person.work}`,
            {
              action: 'share_crew',
              userId: person.userId,
              work: person.work,
            },
          ),
        ),
      );
    case 'delay_notice':
      return delayOffers(db, ctx);
    case 'ask_callback':
      return [
        await make(
          'callback',
          'Ask when to call back',
          'The customer picks morning, afternoon or evening.',
          { action: 'ask_callback' },
        ),
      ];
    case 'ask_visit': {
      const offers: SendOffer[] = [];
      for (const request of await visitAskRequests(db, ctx)) {
        const target = await targetOf(db, request).catch(() => null);
        if (!target?.mayMessage) continue;
        // A crew with no free day cannot be offered; the sheet simply does not list it.
        const offer = await make(
          `visit:${target.taskId ?? target.serviceRequestId ?? target.leadId}`,
          `Ask ${target.customerName.split(/\s+/)[0]} to pick a day for the ${workWords(target.kind)}`,
          target.title,
          request,
        ).catch(() => null);
        if (offer) offers.push(offer);
      }
      return offers;
    }
    case 'ask_paper':
      return [];
    case 'send_signature':
    case 'ask_site_ready':
    case 'ask_installation_check':
    case 'send_handover_pack':
      return journeyOffers(deps, ctx, action, make);
    case 'ask_subsidy_register':
    case 'ask_subsidy_credit':
    case 'ask_bank_sign':
    case 'send_layout':
      return stepOffers(deps, ctx, action, make);
  }
}

/** Only a waiting step whose template lets the customer hear about it (PRD 6.2). */
async function delayOffers(db: Deps['db'], ctx: SendContext): Promise<SendOffer[]> {
  const task = ctx.taskId ? await waitingTask(db, ctx.taskId) : null;
  if (!task?.allowed) return [];
  return [
    {
      key: `delay:${task.id}`,
      action: 'delay_notice',
      label: 'Tell the customer why it is waiting',
      detail: task.stage ?? 'Step on this project',
      request: null,
      input: 'reason',
      preview: null,
    },
  ];
}
