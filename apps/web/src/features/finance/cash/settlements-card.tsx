'use client';

import type { GatewaySettlement } from '@oneohm/api-contracts';
import {
  Card,
  CardHeader,
  type PillTone,
  ResponsiveTable,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { ACCOUNT } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useTrialBalance } from '../use-finance';

/** Matched when nothing is left, waiting while Razorpay holds money, a problem below zero. */
function standing(balance: number): { tone: PillTone; key: 'matched' | 'waiting' | 'check' } {
  if (balance < 0) return { tone: 'overdue', key: 'check' };
  return balance === 0 ? { tone: 'done', key: 'matched' } : { tone: 'waiting', key: 'waiting' };
}

/**
 * Online payments to the bank (PRD 3.11 gateway settlement reconciliation): what the
 * ledger received through Razorpay, what Razorpay paid out (and kept as fees), what it
 * still holds, and every payout with its bank reference.
 */
export function SettlementsCard() {
  const t = useTranslations('finance.settlements');
  const format = useFormatter();
  const settlements = useQuery({
    queryKey: ['finance', 'settlements'],
    queryFn: () => expectStatus(api.paymentLinks.settlements(), 200),
  });
  const balance = useTrialBalance();
  const clearing = balance.data?.accounts.find((account) => account.code === ACCOUNT.gateway);
  const received = clearing?.debitPaise ?? 0;
  const paidOut = clearing?.creditPaise ?? 0;
  const held = received - paidOut;
  const state = standing(held);
  const columns: TableColumn<GatewaySettlement>[] = [
    {
      key: 'date',
      header: t('columns.date'),
      primary: true,
      cell: (row) =>
        format.dateTime(new Date(`${row.settledOn}T12:00:00`), {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
    },
    {
      key: 'reference',
      header: t('columns.reference'),
      cell: (row) => (
        <span className="flex flex-col font-mono text-[0.8125rem]">
          <span className="text-ink">{row.utr ?? t('noUtr')}</span>
          <span className="text-ink-faint">{row.providerSettlementId}</span>
        </span>
      ),
    },
    {
      key: 'fees',
      header: t('columns.fees'),
      align: 'end',
      cell: (row) => (
        <span className="font-mono tabular-nums">{formatInr(row.feesPaise + row.taxPaise)}</span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (row) => (
        <span className="font-mono text-ink tabular-nums">{formatInr(row.amountPaise)}</span>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader
        title={t('title')}
        description={t('intro')}
        action={clearing && <StatusPill tone={state.tone} label={t(`state.${state.key}`)} />}
      />
      {balance.isError && <LoadError error={balance.error} onRetry={() => balance.refetch()} />}
      {clearing && (
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 pb-4 sm:grid-cols-3">
          {[
            { key: 'received', value: received },
            { key: 'paidOut', value: paidOut },
            { key: 'held', value: held },
          ].map((figure) => (
            <div key={figure.key} className="flex flex-col gap-0.5">
              <dt className="type-body-sm text-ink-muted">{t(`figures.${figure.key}`)}</dt>
              <dd className="type-title-lg text-ink tabular-nums">{formatInr(figure.value)}</dd>
            </div>
          ))}
          <p className="type-body-sm text-ink-muted sm:col-span-3">{t(`explain.${state.key}`)}</p>
        </dl>
      )}
      <div className="px-2 pb-3">
        {settlements.isPending && <ListSkeleton label={t('loading')} rows={2} />}
        {settlements.isError && (
          <LoadError error={settlements.error} onRetry={() => settlements.refetch()} />
        )}
        {settlements.data && settlements.data.length === 0 && (
          <p className="px-3 pb-3 type-body-sm text-ink-faint">{t('empty')}</p>
        )}
        {settlements.data && settlements.data.length > 0 && (
          <ResponsiveTable
            caption={t('caption')}
            columns={columns}
            rows={settlements.data}
            rowKey={(row) => row.id}
          />
        )}
      </div>
    </Card>
  );
}
