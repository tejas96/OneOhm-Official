'use client';

import type { Payable } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  type PillTone,
  ResponsiveTable,
  SegmentedControl,
  StatusPill,
  type TableColumn,
  useToast,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useMutation } from '@tanstack/react-query';
import { Check, Plus, ReceiptIndianRupee, Wallet } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { type PayableFilter, useInvalidateFinance, usePayables } from '../use-finance';
import { AddBillDialog } from './add-bill-dialog';
import { PayBillDialog } from './pay-bill-dialog';

const TONE: Readonly<Record<Payable['status'], PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  paid: 'done',
};
const FILTERS = ['open', 'pending', 'approved', 'paid', 'all'] as const;

/** Bills from vendors and crews: approve, then pay. Approval books the cost. */
export function PayablesTab() {
  const t = useTranslations('finance.payables');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const toast = useToast();
  const invalidate = useInvalidateFinance();
  const canAdd = useCan('finance.record_payments');
  const canApprove = useCan('finance.approve_payments');
  const [filter, setFilter] = useState<PayableFilter>('open');
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<Payable | null>(null);
  const query = usePayables(filter);

  const approve = useMutation({
    mutationFn: (bill: Payable) =>
      expectStatus(api.finance.approvePayable({ params: { id: bill.id } }), 200),
    onSuccess: async (bill) => {
      await invalidate();
      toast({ title: t('approved'), description: bill.partyName, tone: 'success' });
    },
    onError: (error) =>
      toast({ title: t('failed'), description: describeError(error), tone: 'error' }),
  });

  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });

  const columns: TableColumn<Payable>[] = [
    {
      key: 'party',
      header: t('columns.party'),
      primary: true,
      cell: (bill) => (
        <span className="flex flex-col">
          <span className="type-body font-medium text-ink">{bill.partyName}</span>
          <span className="type-label text-ink-faint">{t(`party.${bill.party}`)}</span>
        </span>
      ),
    },
    {
      key: 'for',
      header: t('columns.for'),
      cell: (bill) => (
        <span className="flex flex-col type-body-sm">
          <span className="text-ink-muted">{bill.description}</span>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {[bill.projectCode, bill.billNumber].filter(Boolean).join(' · ')}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (bill) => (
        <span className="font-mono text-ink tabular-nums">{formatInr(bill.amountPaise)}</span>
      ),
    },
    {
      key: 'due',
      header: t('columns.due'),
      cell: (bill) =>
        bill.status === 'paid' && bill.paidOn ? (
          <span className="flex flex-col type-body-sm">
            <span className="text-ink">{t('paidOn', { date: date(bill.paidOn) })}</span>
            <span className="text-ink-faint">
              {[bill.paidMethod && methodT(bill.paidMethod), bill.paidReference]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        ) : (
          <span className={bill.overdue ? 'type-body-sm text-overdue' : 'type-body-sm text-ink'}>
            {bill.overdue ? t('overdueSince', { date: date(bill.dueOn) }) : date(bill.dueOn)}
          </span>
        ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (bill) => (
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill size="sm" tone={TONE[bill.status]} label={t(`status.${bill.status}`)} />
          {bill.status === 'pending' && canApprove && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Check />}
              pending={approve.isPending && approve.variables?.id === bill.id}
              onClick={() => approve.mutate(bill)}
            >
              {t('approve')}
            </Button>
          )}
          {bill.status === 'approved' && canAdd && (
            <Button
              size="sm"
              variant="primary"
              leadingIcon={<Wallet />}
              onClick={() => setPaying(bill)}
            >
              {t('pay')}
            </Button>
          )}
        </span>
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          label={t('filterLabel')}
          size="sm"
          options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
        />
        {canAdd && (
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setAdding(true)}>
            {t('add')}
          </Button>
        )}
      </div>
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState
          icon={<ReceiptIndianRupee />}
          title={t('emptyTitle')}
          description={t('emptyBody')}
        />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={query.data}
          rowKey={(bill) => bill.id}
        />
      )}
      <AddBillDialog open={adding} onOpenChange={setAdding} />
      <PayBillDialog bill={paying} onClose={() => setPaying(null)} />
    </section>
  );
}
