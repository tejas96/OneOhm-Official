import type { ReferralReward, UpiCheckInput } from '@oneohm/api-contracts';
import {
  customerActions,
  customers,
  type DatabaseExecutor,
  referralRewards,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { deliverCare } from '../care/care-deliver';
import { careTaps } from '../care/care-taps';
import { REFER_WORDS } from '../care/refer-words';
import { logAction } from '../documents/customer-action-log';

const onceOf = (rewardId: string) => `payout:${rewardId}`;

/**
 * An approved reward needs the customer's UPI ID (redesign §15, owner answer 2). One payout ask per reward
 * (unique), sent as "Share your UPI ID to receive ₹X" with [Share UPI ID]. A customer whose UPI ID staff
 * already checked is not asked again. True when the customer was asked (the plain "approved" message is
 * then not sent too); false when nobody was asked or nothing could be sent.
 */
export async function askUpi(tx: DatabaseExecutor, rewardId: string): Promise<boolean> {
  const [row] = await tx
    .select({
      reward: referralRewards,
      customer: customers,
    })
    .from(referralRewards)
    .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
    .where(eq(referralRewards.id, rewardId));
  if (!row || (row.customer.upiId && row.customer.upiCheckedAt)) return false;
  const amount = formatInr(row.reward.amountPaise);
  const [made] = await tx
    .insert(customerActions)
    .values({
      type: 'payout',
      customerId: row.customer.id,
      projectId: row.reward.projectId,
      title: `UPI ID for the ${amount} reward`,
      payload: { rewardId, amountPaise: row.reward.amountPaise, once: onceOf(rewardId) },
    })
    .onConflictDoNothing()
    .returning({ id: customerActions.id });
  if (!made) return true;
  await logAction(
    tx,
    { projectId: row.reward.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Asked the customer for their UPI ID (${amount} reward)`,
      userId: null,
      data: { customerActionId: made.id },
    },
  );
  const sent = await sendAsk(tx, row.customer, made.id, amount, null);
  return sent !== 'none';
}

async function sendAsk(
  tx: DatabaseExecutor,
  customer: { readonly name: string; readonly phoneE164: string },
  actionId: string,
  amount: string,
  again: string | null,
) {
  return deliverCare(
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
}

/** The UPI ID staff checked for this reward's customer, or a 409 saying it is not ready to pay by UPI. */
export async function checkedUpi(tx: DatabaseExecutor, rewardId: string): Promise<string> {
  const [row] = await tx
    .select({ upiId: customers.upiId, checkedAt: customers.upiCheckedAt })
    .from(referralRewards)
    .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
    .where(eq(referralRewards.id, rewardId));
  if (!row?.upiId)
    throw conflict('The customer has not shared a UPI ID yet. Ask for it first.', 'no_upi');
  if (!row.checkedAt)
    throw conflict(
      "Check the customer's UPI ID (Looks good) before paying by UPI.",
      'upi_unchecked',
    );
  return row.upiId;
}

/** Looks good, or Ask again (with a reason the customer reads), on the UPI ID a customer shared. */
export async function checkUpi(
  db: DatabaseExecutor,
  actor: Actor,
  rewardId: string,
  input: UpiCheckInput,
): Promise<void> {
  const [row] = await db
    .select({ reward: referralRewards, customer: customers })
    .from(referralRewards)
    .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
    .where(eq(referralRewards.id, rewardId));
  if (!row) throw notFound('That reward');
  const [ask] = await db
    .select()
    .from(customerActions)
    .where(sql`${customerActions.payload}->>'once' = ${onceOf(rewardId)}`)
    .for('update');
  if (!ask || ask.status !== 'received' || !row.customer.upiId)
    throw conflict('There is no UPI ID waiting to be checked for this reward.', 'nothing_to_check');
  const now = new Date();
  if (input.result === 'good') {
    await db
      .update(customers)
      .set({ upiCheckedAt: now, upiCheckedByUserId: actor.userId, updatedAt: now })
      .where(eq(customers.id, row.customer.id));
    await db
      .update(customerActions)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'received')));
    await logAction(db, ask, {
      kind: 'customer_action',
      message: 'The UPI ID looks good',
      userId: actor.userId,
      data: { customerActionId: ask.id },
    });
    await recordAudit(
      db,
      actor.userId,
      'referral_reward.upi_checked',
      'referral_reward',
      rewardId,
      {
        result: 'good',
      },
    );
    return;
  }
  const { upi: _upi, ...rest } = ask.payload;
  await db
    .update(customers)
    .set({ upiId: null, upiCheckedAt: null, upiCheckedByUserId: null, updatedAt: now })
    .where(eq(customers.id, row.customer.id));
  await db
    .update(customerActions)
    .set({ status: 'open', doneAt: null, reason: input.reason, updatedAt: now, payload: rest })
    .where(and(eq(customerActions.id, ask.id), eq(customerActions.status, 'received')));
  await logAction(db, ask, {
    kind: 'customer_action',
    message: `Asked the customer for their UPI ID again${input.reason ? `: ${input.reason}` : ''}`,
    userId: actor.userId,
    data: { customerActionId: ask.id },
  });
  await recordAudit(db, actor.userId, 'referral_reward.upi_checked', 'referral_reward', rewardId, {
    result: 'again',
    reason: input.reason,
  });
  await sendAsk(db, row.customer, ask.id, formatInr(row.reward.amountPaise), input.reason);
}

/** The UPI side of each reward row: what the customer shared, whether it was checked, the ask's state. */
export async function upiRows(
  db: DatabaseExecutor,
  rewards: readonly { id: string; paidUpiId: string | null; customerId: string }[],
): Promise<Map<string, ReferralReward['upi']>> {
  const out = new Map<string, ReferralReward['upi']>();
  if (rewards.length === 0) return out;
  const asks = await db
    .select({
      once: sql<string>`${customerActions.payload}->>'once'`,
      status: customerActions.status,
    })
    .from(customerActions)
    .where(
      inArray(
        sql`${customerActions.payload}->>'once'`,
        rewards.map((r) => onceOf(r.id)),
      ),
    );
  const people = await db
    .select({ id: customers.id, upiId: customers.upiId, checkedAt: customers.upiCheckedAt })
    .from(customers)
    .where(inArray(customers.id, [...new Set(rewards.map((r) => r.customerId))]));
  for (const reward of rewards) {
    const person = people.find((p) => p.id === reward.customerId);
    const ask = asks.find((a) => a.once === onceOf(reward.id));
    out.set(reward.id, {
      id: person?.upiId ?? null,
      checked: Boolean(person?.checkedAt),
      ask: ask && ask.status !== 'cancelled' ? ask.status : 'none',
      paidTo: reward.paidUpiId,
    });
  }
  return out;
}
