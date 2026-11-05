import type { ReferralProgram, ReferralReward } from '@oneohm/api-contracts';
import { rows } from './db';
import type { Session } from './http';
import { type Sale, sellProject, today } from './sales';

// Helpers for the referral and UPI scenarios (70-referral-*, phase 6).

/** Switches the programme on at ₹2,000 per referral, earned when the friend's project is made; returns how to put it back. */
export async function programOn(
  admin: Session,
  over: Partial<{ amountPaise: number; basis: 'per_referral' | 'per_kw' }> = {},
): Promise<() => Promise<unknown>> {
  const before = await admin.get<ReferralProgram>('/settings/referrals');
  await admin.put('/settings/referrals', {
    active: true,
    basis: over.basis ?? 'per_referral',
    amountPaise: over.amountPaise ?? 200_000,
    qualifyingEvent: 'project_created',
    startsOn: today(),
    budgetPaise: null,
    perCustomerCount: null,
    perCustomerPaise: null,
    eligibleTypes: [],
    shareNumber: null,
  });
  return () =>
    admin.put('/settings/referrals', {
      ...before,
      shareNumber: before.shareNumber ?? null,
    });
}

/** A referrer with a project, and a friend whose project makes them earn a pending reward. */
export async function earnedReward(admin: Session, name: string) {
  const referrer = await sellProject(admin, { name: `${name} Referrer (test)` });
  const friend = await sellProject(admin, { name: `${name} Friend (test)` });
  await rows('UPDATE leads SET referred_by_customer_id = $1 WHERE id = $2', [
    referrer.customer.customerId,
    friend.customer.leadId,
  ]);
  const reward = await rewardOf(admin, referrer);
  return { referrer, friend, reward };
}

/** The referrer's reward, evaluated now (the list runs the evaluation). */
export async function rewardOf(admin: Session, referrer: Sale): Promise<ReferralReward> {
  const all = await admin.get<ReferralReward[]>('/referral-rewards?status=all');
  const reward = all.find((one) => one.referrer.id === referrer.customer.customerId);
  if (!reward) throw new Error('The referrer earned no reward.');
  return reward;
}

export const customerUpi = async (customerId: string) =>
  (
    await rows<{ upi_id: string | null; checked: boolean }>(
      'SELECT upi_id, upi_checked_at IS NOT NULL AS checked FROM customers WHERE id = $1',
      [customerId],
    )
  )[0];
