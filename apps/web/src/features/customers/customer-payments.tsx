'use client';

import type { CustomerPayment } from '@oneohm/api-contracts';
import {
  Badge,
  Card,
  CardHeader,
  cn,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

/** Every payment received from (or for) the customer, newest first, with receipt numbers. */
export function CustomerPayments({ payments }: { readonly payments: readonly CustomerPayment[] }) {
  const t = useTranslations('customers.money');
  const format = useFormatter();

  const columns: TableColumn<CustomerPayment>[] = [
    {
      key: 'receipt',
      header: t('paymentColumns.receipt'),
      primary: true,
      cell: (payment) => (
        <span className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'whitespace-nowrap font-mono text-[0.875rem]',
              payment.receiptNumber ? 'text-ink' : 'text-ink-faint',
            )}
          >
            {payment.receiptNumber ?? t('noReceipt')}
          </span>
          {payment.reversed && <StatusPill tone="blocked" label={t('reversed')} size="sm" />}
          {payment.reversal && <Badge variant="soft">{t('reversal')}</Badge>}
        </span>
      ),
    },
    {
      key: 'for',
      header: t('paymentColumns.for'),
      cell: (payment) => (
        <span className="flex min-w-0 flex-col items-end gap-0.5 md:items-start">
          <Link
            href={`/projects/${payment.project.id}?tab=payments`}
            className="whitespace-nowrap font-mono text-[0.8125rem] text-ink hover:text-accent"
          >
            {payment.project.code}
          </Link>
          <span className="truncate type-body-sm text-ink-faint">
            {payment.milestoneLabel ?? t('general')}
          </span>
        </span>
      ),
    },
    {
      key: 'method',
      header: t('paymentColumns.method'),
      hideOnPhone: true,
      cell: (payment) => (
        <span className="whitespace-nowrap type-body-sm text-ink-muted">
          {t(`methods.${payment.method}`)}
        </span>
      ),
    },
    {
      key: 'date',
      header: t('paymentColumns.date'),
      cell: (payment) => (
        <span className="whitespace-nowrap type-body-sm text-ink-muted">
          {format.dateTime(new Date(payment.receivedOn), { dateStyle: 'medium' })}
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('paymentColumns.amount'),
      align: 'end',
      cell: (payment) => (
        <span
          className={cn(
            'whitespace-nowrap font-mono tabular-nums',
            payment.reversed && 'text-ink-faint line-through',
            payment.reversal && 'text-overdue',
          )}
        >
          {formatInr(payment.amountPaise)}
        </span>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader title={t('paymentsTitle')} description={t('paymentsBody')} />
      {payments.length === 0 ? (
        <p className="border-t border-hairline px-5 py-4 type-body-sm text-ink-faint">
          {t('paymentsNone')}
        </p>
      ) : (
        <ResponsiveTable
          caption={t('paymentsTitle')}
          columns={columns}
          rows={payments}
          rowKey={(payment) => payment.id}
          className="px-3 pb-3 md:px-1 md:pb-1"
        />
      )}
    </Card>
  );
}
