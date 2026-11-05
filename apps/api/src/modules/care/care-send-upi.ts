import type { SendOffer, SendRequest } from '@oneohm/api-contracts';
import { customerActions } from '@oneohm/database';
import { formatInr, titleCaseName } from '@oneohm/shared';
import { and, eq } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import type { SendContext } from '../send-to-customer/send-context';
import type { Deps } from '../send-to-customer/send-papers';
import type { Composed } from '../send-to-customer/send-recorded';
import { careTaps } from './care-taps';
import { REFER_WORDS } from './refer-words';

type Of<A extends SendRequest['action']> = Extract<SendRequest, { action: A }>;
type Make = (
  key: string,
  label: string,
  detail: string,
  request: SendRequest,
) => Promise<SendOffer>;

/** Payout asks still waiting for the customer's UPI ID. */
const openPayouts = (deps: Deps, ctx: SendContext) =>
  deps.db
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, ctx.customerId),
        eq(customerActions.type, 'payout'),
        eq(customerActions.status, 'open'),
      ),
    );

/** "Share your UPI ID to receive ₹X" again (redesign §15): the message for an ask still waiting. */
export async function upiCompose(
  deps: Deps,
  ctx: SendContext,
  request: Of<'ask_upi'>,
): Promise<Composed> {
  const ask = (await openPayouts(deps, ctx)).find((one) => one.id === request.actionId);
  if (!ask) throw conflict('There is no UPI ID waiting to be asked for.', 'nothing_pending');
  const amount = formatInr(Number(ask.payload.amountPaise ?? 0));
  return {
    built: {
      replies: [
        {
          kind: 'buttons',
          body: REFER_WORDS.upiAsk(amount),
          buttons: [{ id: careTaps.upi(ask.id), title: REFER_WORDS.upiButton }],
        },
      ],
      template: {
        key: 'reward_upi_ask',
        payload: {
          customer: titleCaseName(ctx.customerName),
          amount,
          sharePayload: careTaps.upi(ask.id),
        },
      },
    },
    record: {
      kind: 'log',
      audit: 'customer.upi_asked_again',
      entity: 'customer_action',
      entityId: ask.id,
      log: `Asked the customer for their UPI ID again (${amount} reward, WhatsApp)`,
      projectId: ask.projectId,
      data: { customerActionId: ask.id },
    },
  };
}

export async function upiOffers(deps: Deps, ctx: SendContext, make: Make): Promise<SendOffer[]> {
  const offers: SendOffer[] = [];
  for (const ask of await openPayouts(deps, ctx))
    offers.push(
      await make(
        `upi:${ask.id}`,
        `Ask for the UPI ID again: ${ask.title}`,
        'The customer shares a UPI ID in a form or in the chat; you check it on the reward.',
        { action: 'ask_upi', actionId: ask.id },
      ),
    );
  return offers;
}
