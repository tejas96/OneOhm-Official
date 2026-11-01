'use client';

import type { CustomerMoneyEntry, ReceivedPayment } from '@oneohm/api-contracts';
import { Badge, Card, CardHeader, cn, EmptyState } from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { FileDown, Receipt, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadMore } from '@/components/load-more';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { useCustomerMoney } from '../billing/use-billing';
import { usePaymentsReceived } from '../use-finance';
import { MoneyEntryItem } from './money-entry-item';
import { ReversePaymentDialog } from './reverse-payment-dialog';

type Item =
  | { readonly key: string; readonly at: string; readonly payment: ReceivedPayment }
  | { readonly key: string; readonly at: string; readonly entry: CustomerMoneyEntry };

/**
 * Payments with refunds and credit held, newest first (as recorded). Credit applied to a milestone
 * is already a payment with its receipt, so it is not listed twice.
 */
function merge(
  paid: readonly ReceivedPayment[],
  money: readonly CustomerMoneyEntry[],
  more: boolean,
): Item[] {
  // While older payments wait to load, older refunds wait with them, so the order holds.
  const from = more ? (paid.at(-1)?.createdAt ?? '') : '';
  return [
    ...paid.map((payment) => ({ key: payment.id, at: payment.createdAt, payment })),
    ...money
      .filter((entry) => entry.kind !== 'credit_applied' && entry.createdAt >= from)
      .map((entry) => ({ key: entry.id, at: entry.createdAt, entry })),
  ].sort((left, right) => right.at.localeCompare(left.at));
}

/** The latest money received, each with its receipt; a mistake can be reversed, never edited. */
export function PaymentsReceived() {
  const t = useTranslations('finance.payments');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const canReverse = useCan('finance.approve_payments');
  const list = usePaymentsReceived();
  const { query, items: paid } = list;
  const money = useCustomerMoney();
  const [reversing, setReversing] = useState<ReceivedPayment | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader title={t('title')} description={t('description')} />
      {query.isPending ? (
        <div className="px-5 pb-5">
          <ListSkeleton label={t('loading')} rows={4} />
        </div>
      ) : query.isError && paid.length === 0 ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} className="m-5" />
      ) : paid.length === 0 && !money.data?.length ? (
        <EmptyState icon={<Receipt />} title={t('empty')} className="m-5" />
      ) : (
        <ul className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {merge(paid, money.data ?? [], list.hasMore).map((item) => {
            if ('entry' in item) return <MoneyEntryItem key={item.key} entry={item.entry} />;
            const { payment } = item;
            const reversal = payment.reversesPaymentId !== null;
            return (
              <li
                key={payment.id}
                className={cn(
                  'grid gap-x-4 gap-y-1 px-5 py-3.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] sm:items-center',
                  payment.reversed && 'opacity-60',
                )}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/projects/${payment.projectId}?tab=payments`}
                      className="truncate type-body font-medium text-ink hover:text-accent"
                    >
                      {payment.customerName}
                    </Link>
                    {payment.reversed && <Badge variant="outline">{t('reversed')}</Badge>}
                    {reversal && <Badge variant="soft">{t('reversal')}</Badge>}
                  </span>
                  <span className="truncate font-mono text-[0.75rem] text-ink-faint">
                    {[payment.receiptNumber, payment.projectCode].filter(Boolean).join(' · ')}
                  </span>
                </div>
                <div className="flex flex-col type-body-sm text-ink-muted">
                  <span>
                    {format.dateTime(new Date(`${payment.receivedOn}T12:00:00`), {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}{' '}
                    · {methodT(payment.method)}
                  </span>
                  <span className="truncate text-ink-faint">
                    {reversal ? payment.reversalReason : (payment.milestoneLabel ?? '')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 sm:justify-end">
                  <span className="flex flex-col items-end">
                    <span className="font-mono text-ink tabular-nums">
                      {formatInr(payment.amountPaise)}
                    </span>
                    {payment.tdsPaise > 0 && (
                      <span className="whitespace-nowrap type-label text-ink-faint">
                        {t('tdsIncluded', { amount: formatInr(payment.tdsPaise) })}
                      </span>
                    )}
                  </span>
                  {payment.receiptNumber && (
                    <a
                      href={`/api/v1/finance/payments/${payment.id}/receipt?disposition=inline`}
                      target="_blank"
                      rel="noopener"
                      title={t('receipt', { number: payment.receiptNumber })}
                      className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-accent"
                    >
                      <FileDown aria-hidden className="size-4" />
                      <span className="sr-only">
                        {t('receipt', { number: payment.receiptNumber })}
                      </span>
                    </a>
                  )}
                  {canReverse && !reversal && !payment.reversed && (
                    <button
                      type="button"
                      onClick={() => setReversing(payment)}
                      title={t('reverse')}
                      className="flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken hover:text-overdue"
                    >
                      <Undo2 aria-hidden className="size-4" />
                      <span className="sr-only">{t('reverse')}</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore
        shown={paid.length}
        total={list.total}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        onMore={list.loadMore}
        className="border-t border-hairline pt-4"
      />
      <ReversePaymentDialog payment={reversing} onClose={() => setReversing(null)} />
    </Card>
  );
}
