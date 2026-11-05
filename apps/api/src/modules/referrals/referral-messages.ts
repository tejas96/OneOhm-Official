import {
  customers,
  type DatabaseExecutor,
  leads,
  notifyHolders,
  queueCustomerMessage,
  referralRewards,
} from '@oneohm/database';
import type { IncentiveStatus } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { deliverCare } from '../care/care-deliver';
import { REFER_WORDS } from '../care/refer-words';
import { askUpi } from './reward-upi';

const METHOD: Readonly<Record<string, string>> = {
  cash: 'in cash',
  cheque: 'by cheque',
  bank_transfer: 'by bank transfer',
  upi: 'by UPI',
};

function paidOnWords(day: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

type RewardRow = typeof referralRewards.$inferSelect;

/** How the step reads in "your reward for Suresh (₹2,000) is …". */
function statusWords(reward: RewardRow): string {
  if (reward.status === 'pending') return 'earned and waiting for approval';
  if (reward.status === 'approved') return 'approved and will be paid soon';
  if (reward.status === 'rejected') return `not approved (${reward.rejectReason ?? 'see app'})`;
  const how = reward.paidMethod ? (METHOD[reward.paidMethod] ?? '') : '';
  const when = reward.paidOn ? ` on ${paidOnWords(reward.paidOn)}` : '';
  const reference = reward.paidReference ? `, reference ${reward.paidReference}` : '';
  return `paid ${how}${when}${reference}`.replace(/\s+/g, ' ').trim();
}

/**
 * Tells the referring customer about each step of their reward, on WhatsApp and in the
 * app (PRD 5.6), and tells finance what needs doing next. Each step messages once.
 */
export async function announceReward(
  db: DatabaseExecutor,
  rewardId: string,
  actorUserId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ reward: referralRewards, referrer: customers, friend: leads.name })
    .from(referralRewards)
    .innerJoin(customers, eq(customers.id, referralRewards.referrerCustomerId))
    .innerJoin(leads, eq(leads.id, referralRewards.leadId))
    .where(eq(referralRewards.id, rewardId))
    .limit(1);
  if (!row) return;
  const { reward, referrer, friend } = row;
  const amount = formatInr(reward.amountPaise);
  const payload = {
    customer: referrer.name.split(/\s+/)[0] ?? referrer.name,
    friend,
    amount,
    status: statusWords(reward),
  };
  const key = `referral_reward:${reward.id}:${reward.status}`;
  // Approved: the customer is asked for their UPI ID instead of the plain "approved" line.
  const asked = reward.status === 'approved' && (await askUpi(db, reward.id));
  if (reward.status === 'paid' && reward.paidMethod === 'upi') {
    // Paid by UPI: "₹2,000 sent to your UPI ✅" in the chat; outside it the usual reward message.
    await deliverCare(
      db,
      { phone: referrer.phoneE164 },
      {
        template: 'referral_reward',
        payload,
        key,
        reply: async () => ({ kind: 'text', body: REFER_WORDS.paid(amount) }),
      },
    );
  } else if (!asked)
    await queueCustomerMessage(db, referrer.phoneE164, 'referral_reward', payload, key);
  const next: Partial<Record<IncentiveStatus, { capability: string; title: string }>> = {
    pending: { capability: 'finance.approve_payments', title: 'Referral reward to approve' },
    approved: { capability: 'finance.record_payments', title: 'Referral reward to pay' },
  };
  const step = next[reward.status];
  if (!step) return;
  await notifyHolders(
    db,
    step.capability,
    {
      kind: 'referral_reward',
      title: step.title,
      body: `${amount} to ${referrer.name} for referring ${friend}.`,
      dedupeKey: `referral_reward:${reward.id}:${reward.status}`,
    },
    actorUserId,
  );
}
