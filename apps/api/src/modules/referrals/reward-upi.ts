import type { UpiCheckInput } from '@oneohm/api-contracts';
import {
  customerActions,
  customers,
  type DatabaseExecutor,
  notifyHolders,
  referralRewards,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
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
  // A customer who has shared a UPI ID (checked or not) is not asked again: the new reward joins that check.
  if (!row || row.customer.upiId) return false;
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

/**
 * The UPI ID staff checked for this reward's customer, read under a lock in the paying transaction. `seen` is
 * the ID the person paying saw; a customer who changed it meanwhile makes it a 409 (never pay an unseen ID).
 */
export async function checkedUpi(
  tx: DatabaseExecutor,
  rewardId: string,
  seen: string | null | undefined,
): Promise<string> {
  const [reward] = await tx
    .select({ customerId: referralRewards.referrerCustomerId })
    .from(referralRewards)
    .where(eq(referralRewards.id, rewardId));
  const [row] = reward
    ? await tx
        .select({ upiId: customers.upiId, checkedAt: customers.upiCheckedAt })
        .from(customers)
        .where(eq(customers.id, reward.customerId))
        .for('update')
    : [];
  if (!row?.upiId)
    throw conflict('The customer has not shared a UPI ID yet. Ask for it first.', 'no_upi');
  if (!row.checkedAt)
    throw conflict(
      "Check the customer's UPI ID (Looks good) before paying by UPI.",
      'upi_unchecked',
    );
  if (!seen || seen.toLowerCase() !== row.upiId)
    throw conflict(
      'The UPI ID changed. Open the reward again and pay to the ID you see.',
      'upi_changed',
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
  // Read the customer under a lock: the ID checked is the ID the person saw.
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, row.customer.id))
    .for('update');
  if (!customer?.upiId)
    throw conflict('There is no UPI ID waiting to be checked for this reward.', 'nothing_to_check');
  if (customer.upiId !== input.upiId.toLowerCase())
    throw conflict('The UPI ID changed. Open the reward again to see the new one.', 'upi_changed');
  const [ask] = await db
    .select()
    .from(customerActions)
    .where(sql`${customerActions.payload}->>'once' = ${onceOf(rewardId)}`)
    .for('update');
  const now = new Date();
  const amount = formatInr(row.reward.amountPaise);
  if (input.result === 'good') {
    await db
      .update(customers)
      .set({ upiCheckedAt: now, upiCheckedByUserId: actor.userId, updatedAt: now })
      .where(eq(customers.id, customer.id));
    // Every payout ask of this customer that waited for this check is done with it.
    await db
      .update(customerActions)
      .set({ status: 'closed', closedAt: now, updatedAt: now })
      .where(
        and(
          eq(customerActions.customerId, customer.id),
          eq(customerActions.type, 'payout'),
          eq(customerActions.status, 'received'),
        ),
      );
    if (ask)
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
  await db
    .update(customers)
    .set({ upiId: null, upiCheckedAt: null, upiCheckedByUserId: null, updatedAt: now })
    .where(eq(customers.id, customer.id));
  let askId = ask?.id;
  if (ask)
    await db
      .update(customerActions)
      .set({ status: 'open', doneAt: null, reason: input.reason, updatedAt: now })
      .where(and(eq(customerActions.id, ask.id), ne(customerActions.status, 'cancelled')));
  else {
    // The reward joined an earlier check: it gets its own ask now.
    const [made] = await db
      .insert(customerActions)
      .values({
        type: 'payout',
        customerId: customer.id,
        projectId: row.reward.projectId,
        title: `UPI ID for the ${amount} reward`,
        reason: input.reason,
        payload: { rewardId, amountPaise: row.reward.amountPaise, once: onceOf(rewardId) },
      })
      .returning({ id: customerActions.id });
    askId = made?.id;
  }
  await recordAudit(db, actor.userId, 'referral_reward.upi_checked', 'referral_reward', rewardId, {
    result: 'again',
    reason: input.reason,
  });
  if (askId) await sendAsk(db, customer, askId, amount, input.reason);
}
