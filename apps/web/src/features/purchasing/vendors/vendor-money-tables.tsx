'use client';

import type { VendorAdvance, VendorProfile } from '@oneohm/api-contracts';
import {
  EmptyState,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { HandCoins, ReceiptIndianRupee } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { AdvanceStatusPill } from '../advances/advance-status';

type Bill = VendorProfile['bills'][number];

const BILL_TONE: Readonly<Record<Bill['status'], PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
};

function useDay() {
  const format = useFormatter();
  return (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    });
}

const money = (paise: number, tone = 'text-ink') => (
  <span className={`font-mono tabular-nums ${tone}`}>{formatInr(paise)}</span>
);

/** Bills still to pay, oldest due first, with any advance already set against them. */
export function VendorBillsTable({ bills }: { readonly bills: readonly Bill[] }) {
  const t = useTranslations('purchasing.profile.bills');
  const day = useDay();
  if (bills.length === 0) {
    return (
      <EmptyState
        icon={<ReceiptIndianRupee />}
        title={t('emptyTitle')}
        description={t('emptyBody')}
      />
    );
  }
  const columns: readonly TableColumn<Bill>[] = [
    {
      key: 'bill',
      header: t('columns.bill'),
      primary: true,
      cell: (bill) => (
        <span className="flex flex-col items-start gap-1">
          <span className="type-body-sm text-ink">{bill.description}</span>
          <StatusPill size="sm" tone={BILL_TONE[bill.status]} label={t(`status.${bill.status}`)} />
        </span>
      ),
    },
    {
      key: 'billed',
      header: t('columns.billed'),
      hideOnPhone: true,
      cell: (bill) => (
        <span className="whitespace-nowrap text-ink-muted">{day(bill.billedOn)}</span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (bill) => (
        <span
          className={bill.overdue ? 'whitespace-nowrap text-overdue' : 'whitespace-nowrap text-ink'}
        >
          {bill.overdue ? t('overdueSince', { date: day(bill.dueOn) }) : day(bill.dueOn)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      hideOnPhone: true,
      cell: (bill) => money(bill.amountPaise, 'text-ink-muted'),
    },
    {
      key: 'adjusted',
      header: t('columns.adjusted'),
      align: 'end',
      hideOnPhone: true,
      cell: (bill) =>
        bill.adjustedPaise > 0 ? (
          money(bill.adjustedPaise, 'text-ink-muted')
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'balance',
      header: t('columns.balance'),
      align: 'end',
      cell: (bill) => money(bill.balancePaise),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveTable
        caption={t('caption')}
        columns={columns}
        rows={bills}
        rowKey={(bill) => bill.id}
      />
      <Link
        href="/finance?tab=payables"
        className="self-end type-body-sm text-accent hover:underline"
      >
        {t('toFinance')}
      </Link>
    </div>
  );
}

/** Advances paid or waiting, and how much each still has to set against bills. */
export function VendorAdvancesTable({ advances }: { readonly advances: readonly VendorAdvance[] }) {
  const t = useTranslations('purchasing.profile.advances');
  const day = useDay();
  if (advances.length === 0) {
    return <EmptyState icon={<HandCoins />} title={t('emptyTitle')} description={t('emptyBody')} />;
  }
  const columns: readonly TableColumn<VendorAdvance>[] = [
    {
      key: 'advance',
      header: t('columns.advance'),
      primary: true,
      cell: (advance) => (
        <span className="flex flex-col items-start gap-1">
          <span className="font-mono type-body-sm font-medium text-ink">{advance.number}</span>
          <AdvanceStatusPill advance={advance} />
        </span>
      ),
    },
    {
      key: 'order',
      header: t('columns.order'),
      cell: (advance) => (
        <Link
          href={`/inventory?tab=orders&order=${advance.purchaseOrder.id}`}
          className="relative z-10 font-mono text-[0.8125rem] text-ink-muted hover:text-accent"
        >
          {advance.purchaseOrder.number}
        </Link>
      ),
    },
    {
      key: 'paid',
      header: t('columns.paid'),
      hideOnPhone: true,
      cell: (advance) => (
        <span className="whitespace-nowrap text-ink-muted">
          {advance.paidOn ? day(advance.paidOn) : '—'}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (advance) => money(advance.amountPaise),
    },
    {
      key: 'open',
      header: t('columns.open'),
      align: 'end',
      cell: (advance) =>
        money(advance.openPaise, advance.openPaise > 0 ? 'text-ink' : 'text-ink-faint'),
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <ResponsiveTable
        caption={t('caption')}
        columns={columns}
        rows={advances}
        rowKey={(advance) => advance.id}
      />
      <Link
        href="/finance?tab=advances"
        className="self-end type-body-sm text-accent hover:underline"
      >
        {t('toFinance')}
      </Link>
    </div>
  );
}
