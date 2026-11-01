'use client';

import type { VendorAdvance } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  SegmentedControl,
  type TableColumn,
  useToast,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { useMutation } from '@tanstack/react-query';
import { Ban, Check, HandCoins, Plus, Wallet } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';
import { type AdvanceFilter, useAdvances, useRefreshPurchasing } from '../use-purchasing';
import { AdvanceStatusPill } from './advance-status';
import { PayAdvanceDialog } from './pay-advance-dialog';
import { RecordAdvanceDialog } from './record-advance-dialog';

const FILTERS = ['open', 'pending', 'approved', 'paid', 'cancelled', 'all'] as const;
type Step = 'approve' | 'cancel';

/** Advances to vendors against purchase orders: record, approve, pay, then used by bills. */
export function AdvancesTab() {
  const t = useTranslations('purchasing.advances');
  const methodT = useTranslations('finance.methods');
  const format = useFormatter();
  const toast = useToast();
  const refresh = useRefreshPurchasing();
  const canRecord = useCan('finance.record_payments');
  const canApprove = useCan('finance.approve_payments');
  const [filter, setFilter] = useState<AdvanceFilter>('open');
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<VendorAdvance | null>(null);
  const query = useAdvances(filter);

  const step = useMutation({
    mutationFn: ({ id, which }: { id: string; which: Step }) =>
      which === 'approve'
        ? expectStatus(api.purchasing.advances.approve({ params: { id } }), 200)
        : expectStatus(api.purchasing.advances.cancel({ params: { id } }), 200),
    onSuccess: async (advance, { which }) => {
      await refresh();
      toast({ tone: 'success', title: t(`done.${which}`, { number: advance.number }) });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
  const busy = (advance: VendorAdvance, which: Step) =>
    step.isPending && step.variables?.id === advance.id && step.variables.which === which;
  const date = (value: string) =>
    format.dateTime(new Date(`${value}T12:00:00`), { day: 'numeric', month: 'short' });

  const columns: TableColumn<VendorAdvance>[] = [
    {
      key: 'advance',
      header: t('columns.advance'),
      primary: true,
      cell: (advance) => (
        <span className="flex flex-col items-start gap-1.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono type-body-sm font-medium text-ink">{advance.number}</span>
            <AdvanceStatusPill advance={advance} />
          </span>
          {advance.note && <span className="type-body-sm text-ink-muted">{advance.note}</span>}
        </span>
      ),
    },
    {
      key: 'vendor',
      header: t('columns.vendor'),
      cell: (advance) => (
        <span className="flex flex-col gap-0.5 type-body-sm">
          <Link
            href={`/inventory/vendors/${advance.vendor.id}`}
            className="relative z-10 text-ink hover:text-accent"
          >
            {advance.vendor.name}
          </Link>
          <Link
            href={`/inventory?tab=orders&order=${advance.purchaseOrder.id}`}
            className="relative z-10 font-mono text-[0.75rem] text-ink-faint hover:text-accent"
          >
            {[advance.purchaseOrder.number, advance.projectCode ?? t('forStock')].join(' · ')}
          </Link>
        </span>
      ),
    },
    {
      key: 'amount',
      header: t('columns.amount'),
      align: 'end',
      cell: (advance) => (
        <span className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-ink tabular-nums">{formatInr(advance.amountPaise)}</span>
          {advance.status === 'paid' && (
            <span className="type-label text-ink-faint">
              {t('openOf', { open: formatInr(advance.openPaise) })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'paid',
      header: t('columns.paid'),
      hideOnPhone: true,
      cell: (advance) =>
        advance.paidOn ? (
          <span className="flex flex-col type-body-sm">
            <span className="text-ink">{date(advance.paidOn)}</span>
            <span className="text-ink-faint">
              {[advance.paidMethod && methodT(advance.paidMethod), advance.paidReference]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        ) : (
          <span className="type-body-sm text-ink-faint">
            {advance.recordedBy ? t('recordedBy', { name: advance.recordedBy.fullName }) : '—'}
          </span>
        ),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      cell: (advance) => (
        <span className="flex flex-wrap items-center gap-2">
          {advance.status === 'paid' && (
            <span className="type-body-sm text-ink-faint">
              {t(advance.openPaise > 0 ? 'nextBill' : 'allUsed')}
            </span>
          )}
          {advance.status === 'pending' && canApprove && (
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Check />}
              pending={busy(advance, 'approve')}
              onClick={() => step.mutate({ id: advance.id, which: 'approve' })}
            >
              {t('approve')}
            </Button>
          )}
          {advance.status === 'approved' && canRecord && (
            <Button
              size="sm"
              variant="primary"
              leadingIcon={<Wallet />}
              onClick={() => setPaying(advance)}
            >
              {t('pay')}
            </Button>
          )}
          {(advance.status === 'pending' || advance.status === 'approved') &&
            (canRecord || canApprove) && (
              <Button
                size="sm"
                variant="quiet"
                leadingIcon={<Ban />}
                pending={busy(advance, 'cancel')}
                onClick={() => step.mutate({ id: advance.id, which: 'cancel' })}
              >
                {t('cancel')}
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
          className="max-w-full overflow-x-auto [&_*]:whitespace-nowrap"
        />
        {canRecord && (
          <Button variant="primary" leadingIcon={<Plus />} onClick={() => setRecording(true)}>
            {t('add')}
          </Button>
        )}
      </div>
      <p className="max-w-2xl type-body-sm text-ink-muted">{t('explainer')}</p>
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<HandCoins />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={query.data}
          rowKey={(advance) => advance.id}
        />
      )}
      <RecordAdvanceDialog open={recording} onClose={() => setRecording(false)} />
      <PayAdvanceDialog advance={paying} onClose={() => setPaying(null)} />
    </section>
  );
}
