'use client';

import type { ReferralReward } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { type PayoutActions, PayoutStatus } from './payout-status';
import { RewardUpi } from './reward-upi';
import type { PayoutTarget } from './use-payouts';

const targetOf = (reward: ReferralReward): PayoutTarget => ({
  kind: 'referrals',
  id: reward.id,
  amountPaise: reward.amountPaise,
  party: reward.referrer.name,
  upiId: reward.upi.id,
});

/** Referral rewards: who referred whom, the project that earned it and the terms. */
export function RewardsTable({
  rows,
  actions,
  focused = null,
}: {
  readonly rows: readonly ReferralReward[];
  readonly actions: PayoutActions;
  /** The row a link pointed at, highlighted. */
  readonly focused?: string | null;
}) {
  const t = useTranslations('finance.payouts');
  const format = useFormatter();
  const columns: TableColumn<ReferralReward>[] = [
    {
      key: 'referrer',
      header: t('columns.referrer'),
      primary: true,
      cell: (reward) => (
        <span className="flex flex-col">
          <span className="type-body font-medium text-ink">{reward.referrer.name}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">{reward.referrer.phone}</span>
        </span>
      ),
    },
    {
      key: 'friend',
      header: t('columns.friend'),
      cell: (reward) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink-muted">{reward.friendName}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {`${reward.projectCode} · ${formatKwp(reward.capacityWp)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'earned',
      header: t('columns.earned'),
      cell: (reward) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink-muted">
            {format.dateTime(new Date(reward.earnedAt), { day: 'numeric', month: 'short' })}
          </span>
          <span className="text-ink-faint">
            {reward.basis === 'per_kw'
              ? t('rewardPerKw', {
                  amount: formatInr(reward.ratePaise),
                  event: t(`events.${reward.qualifyingEvent}`),
                })
              : t('rewardFlat', { event: t(`events.${reward.qualifyingEvent}`) })}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (reward) => (
        <span className="font-mono text-ink tabular-nums">{formatInr(reward.amountPaise)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (reward) => (
        <span className="flex flex-col">
          <PayoutStatus row={reward} target={targetOf(reward)} actions={actions} />
          <RewardUpi reward={reward} />
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('referralsCaption')}
      columns={columns}
      rows={rows}
      rowKey={(reward) => reward.id}
      focusedKey={focused}
    />
  );
}
