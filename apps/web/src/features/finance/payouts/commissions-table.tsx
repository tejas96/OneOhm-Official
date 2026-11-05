'use client';

import type { CommissionEntry } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { percent } from '@/features/team/resellers/rule-summary';
import { useCan } from '@/providers/current-user';
import { type PayoutActions, PayoutStatus } from './payout-status';
import type { PayoutTarget } from './use-payouts';

const targetOf = (entry: CommissionEntry): PayoutTarget => ({
  kind: 'commissions',
  id: entry.id,
  amountPaise: entry.amountPaise,
  party: entry.reseller.fullName,
});

/** Commission per project a reseller sold, with the terms it was earned on. */
export function CommissionsTable({
  rows,
  actions,
  focused = null,
}: {
  readonly rows: readonly CommissionEntry[];
  readonly actions: PayoutActions;
  /** The row a link pointed at, highlighted. */
  readonly focused?: string | null;
}) {
  const t = useTranslations('finance.payouts');
  const format = useFormatter();
  const canPay = useCan('finance.record_payments');
  const columns: TableColumn<CommissionEntry>[] = [
    {
      key: 'reseller',
      header: t('columns.reseller'),
      primary: true,
      cell: (entry) => (
        <span className="flex flex-col">
          <span className="type-body font-medium text-ink">{entry.reseller.fullName}</span>
          <span className="type-label text-ink-faint">
            {t('earnedOn', {
              date: format.dateTime(new Date(entry.earnedAt), { day: 'numeric', month: 'short' }),
              event: t(`events.${entry.qualifyingEvent}`),
            })}
          </span>
          {canPay && (
            <button
              type="button"
              onClick={() => actions.onPayoutDetails(entry.reseller)}
              aria-label={`${t('viewDetails')}: ${entry.reseller.fullName}`}
              className="mt-1 self-start rounded-sm type-label text-accent hover:underline focus-visible:outline-2 focus-visible:outline-focus"
            >
              {t('viewDetails')}
            </button>
          )}
        </span>
      ),
    },
    {
      key: 'project',
      header: t('columns.project'),
      cell: (entry) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink-muted">{entry.customerName}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {`${entry.projectCode} · ${formatKwp(entry.capacityWp)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'basis',
      header: t('columns.basis'),
      cell: (entry) => (
        <span className="type-body-sm text-ink-muted">
          {entry.basis === 'percent'
            ? t('basisPercent', {
                rate: percent(entry.rateBp),
                value: formatInr(entry.projectValuePaise),
              })
            : t('basisPerKw', {
                amount: formatInr(entry.perKwPaise),
                size: formatKwp(entry.capacityWp),
              })}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (entry) => (
        <span className="font-mono text-ink tabular-nums">{formatInr(entry.amountPaise)}</span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (entry) => (
        <PayoutStatus
          row={entry}
          target={targetOf(entry)}
          actions={actions}
          party={entry.reseller}
        />
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('commissionsCaption')}
      columns={columns}
      rows={rows}
      rowKey={(entry) => entry.id}
      focusedKey={focused}
    />
  );
}
