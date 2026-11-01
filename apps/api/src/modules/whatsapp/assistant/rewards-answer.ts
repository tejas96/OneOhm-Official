import type { Referral } from '@oneohm/api-contracts';
import { formatInr } from '@oneohm/shared';
import { plainDate } from './plain-date';
import { REWARD_WORDS } from './words';

/** At most this many people in one answer; the app lists the rest. */
const SHOWN = 8;

function rewardOf(reward: NonNullable<Referral['reward']>): string {
  const amount = formatInr(reward.amountPaise);
  if (reward.status === 'paid')
    return REWARD_WORDS.reward.paid(amount, reward.paidOn ? plainDate(reward.paidOn) : null);
  return REWARD_WORDS.reward[reward.status](amount);
}

/**
 * "My rewards": each person the customer referred, how it is going, and the reward
 * (waiting, approved or paid, with the amount), then what is paid and on the way.
 */
export function rewardsText(referrals: readonly Referral[]): string {
  if (referrals.length === 0) return REWARD_WORDS.none;
  const rows = referrals.slice(0, SHOWN).map((referral) => {
    const status = REWARD_WORDS.status[referral.status];
    const reward = referral.reward ? `; ${rewardOf(referral.reward)}` : '';
    return `• ${referral.name}: ${status}${reward}`;
  });
  const total = (statuses: readonly string[]) =>
    referrals
      .filter((referral) => referral.reward && statuses.includes(referral.reward.status))
      .reduce((sum, referral) => sum + (referral.reward?.amountPaise ?? 0), 0);
  const paid = total(['paid']);
  const coming = total(['pending', 'approved']);
  const totals = [
    paid > 0 ? REWARD_WORDS.paidTotal(formatInr(paid)) : '',
    coming > 0 ? REWARD_WORDS.comingTotal(formatInr(coming)) : '',
  ].filter(Boolean);
  const more = referrals.length > SHOWN ? [REWARD_WORDS.more(referrals.length - SHOWN)] : [];
  return [REWARD_WORDS.title, ...rows, ...more, ...(totals.length ? ['', ...totals] : [])].join(
    '\n',
  );
}
