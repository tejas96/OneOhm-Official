import {
  customerActions,
  type DatabaseExecutor,
  notifyHolders,
  referralRewards,
} from '@oneohm/database';
import { and, eq, inArray } from 'drizzle-orm';
import { deliverCare } from '../care/care-deliver';
import { careTaps } from '../care/care-taps';
import { REFER_WORDS } from '../care/refer-words';
import { logAction } from '../documents/customer-action-log';

/**
 * A payout ask is done when its reward is paid (any method), rejected or cancelled: every open or received
 * payout ask of the customer whose reward is no longer pending or approved is closed, with a line in the log.
 */
export async function closePayoutAsks(
  tx: DatabaseExecutor,
  customerId: string,
  userId: string | null,
): Promise<void> {
  const asks = await tx
    .select()
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, 'payout'),
        inArray(customerActions.status, ['open', 'received']),
      ),
    )
    .for('update');
  for (const ask of asks) {
    const [reward] = await tx
      .select({ status: referralRewards.status })
      .from(referralRewards)
      .where(eq(referralRewards.id, String(ask.payload.rewardId ?? '')));
    if (reward && (reward.status === 'pending' || reward.status === 'approved')) continue;
    const now = new Date();
    await tx
      .update(customerActions)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(eq(customerActions.id, ask.id));
    await logAction(tx, ask, {
      kind: 'customer_action',
      message: `The UPI ID ask was closed: the reward is ${reward?.status ?? 'gone'}`,
      userId,
      data: { customerActionId: ask.id },
    });
  }
}

/** The ask could not reach the customer (window closed, template off, STOP): finance is told to ask. */
async function tellFinance(tx: DatabaseExecutor, name: string, actionId: string, amount: string) {
  await notifyHolders(tx, 'finance.record_payments', {
    kind: 'referral_upi_ask_failed',
    title: `Ask ${name} for their UPI ID`,
    body: `${amount} reward: the message could not reach them. Use Send to customer -> Ask for the UPI ID, or call.`,
    dedupeKey: `referral_upi_ask_failed:${actionId}:${Date.now()}`,
  });
}

export async function sendAsk(
  tx: DatabaseExecutor,
  customer: { readonly name: string; readonly phoneE164: string },
  actionId: string,
  amount: string,
  again: string | null,
) {
  const sent = await deliverCare(
    tx,
    { phone: customer.phoneE164 },
    {
      template: 'reward_upi_ask',
      payload: {
        customer: customer.name.split(/\s+/)[0] ?? customer.name,
        amount,
        sharePayload: careTaps.upi(actionId),
      },
      key: `reward_upi_ask:${actionId}:${again === null ? 'first' : Date.now()}`,
      reply: async () => ({
        kind: 'buttons',
        body: again === null ? REFER_WORDS.upiAsk(amount) : REFER_WORDS.upiAgain(again),
        buttons: [{ id: careTaps.upi(actionId), title: REFER_WORDS.upiButton }],
      }),
    },
  );
  if (sent === 'none') await tellFinance(tx, customer.name, actionId, amount);
  return sent;
}
