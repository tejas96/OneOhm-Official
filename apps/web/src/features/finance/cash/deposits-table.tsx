'use client';

import type { MoneyDeposit } from '@oneohm/api-contracts';
import { ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';

/** Every deposit slip: when, the bank's reference, and the cash and cheques on it. */
export function DepositsTable({ deposits }: { readonly deposits: readonly MoneyDeposit[] }) {
  const t = useTranslations('finance.cash.deposits');
  const format = useFormatter();
  const money = (paise: number) => (
    <span className="font-mono text-ink tabular-nums">{paise > 0 ? formatInr(paise) : '—'}</span>
  );
  const columns: TableColumn<MoneyDeposit>[] = [
    {
      key: 'number',
      header: t('columns.number'),
      primary: true,
      cell: (deposit) => (
        <span className="flex flex-col">
          <span className="font-mono type-body-sm text-ink">{deposit.number}</span>
          <span className="type-label text-ink-faint">
            {format.dateTime(new Date(`${deposit.depositedOn}T12:00:00`), {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </span>
        </span>
      ),
    },
    {
      key: 'reference',
      header: t('columns.reference'),
      cell: (deposit) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{deposit.bankReference ?? '—'}</span>
          {deposit.note && <span className="text-ink-faint">{deposit.note}</span>}
        </span>
      ),
    },
    { key: 'cash', header: t('columns.cash'), align: 'end', cell: (d) => money(d.cashPaise) },
    {
      key: 'cheques',
      header: t('columns.cheques'),
      align: 'end',
      cell: (d) => money(d.chequePaise),
    },
    {
      key: 'by',
      header: t('columns.by'),
      cell: (deposit) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink">{deposit.depositedBy ?? '—'}</span>
          <span className="text-ink-faint">{t('items', { count: deposit.items })}</span>
        </span>
      ),
    },
  ];
  return (
    <ResponsiveTable
      caption={t('caption')}
      columns={columns}
      rows={deposits}
      rowKey={(deposit) => deposit.id}
    />
  );
}
