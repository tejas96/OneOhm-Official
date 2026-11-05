import type { UpiCheckInput } from '@oneohm/api-contracts';
import {
  customerActions,
  customers,
  type DatabaseExecutor,
  referralRewards,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { and, eq, ne, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';
import { logAction } from '../documents/customer-action-log';
import { sendAsk } from './reward-upi-ask';

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
      payload: {
        rewardId,
        amountPaise: row.reward.amountPaise,
        once: onceOf(rewardId),
      },
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
    .where(
      and(
        sql`${customerActions.payload}->>'once' = ${onceOf(rewardId)}`,
        // A cancelled ask is gone: Ask again makes a new one.
        ne(customerActions.status, 'cancelled'),
      ),
    )
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
      .set({
        status: 'open',
        doneAt: null,
        reason: input.reason,
        payload: sql`${customerActions.payload} || ${JSON.stringify({ askedAt: now.toISOString() })}::jsonb`,
        updatedAt: now,
      })
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
        payload: {
          rewardId,
          amountPaise: row.reward.amountPaise,
          once: onceOf(rewardId),
        },
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
