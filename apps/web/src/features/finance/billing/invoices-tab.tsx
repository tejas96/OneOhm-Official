'use client';

import type { TaxInvoice } from '@oneohm/api-contracts';
import {
  EmptyState,
  ResponsiveTable,
  SegmentedControl,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { Ban, FileDown, FileText, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan } from '@/providers/current-user';
import { CancelInvoiceDialog } from './cancel-invoice-dialog';
import { invoicePdfHref, useInvoices } from './use-billing';

type Filter = 'issued' | 'cancelled' | 'all';
const ICON =
  'relative z-[2] flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-sunken';

/** Every GST tax invoice, newest first. Invoices are made from the project's Payments tab. */
export function InvoicesTab() {
  const t = useTranslations('finance.billing.invoices');
  const invoiceT = useTranslations('finance.billing.invoice');
  const format = useFormatter();
  const canCancel = useCan('finance.approve_payments');
  const query = useInvoices();
  const [filter, setFilter] = useState<Filter>('issued');
  const [cancelling, setCancelling] = useState<TaxInvoice | null>(null);

  const columns: TableColumn<TaxInvoice>[] = [
    {
      key: 'invoice',
      header: t('columns.invoice'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-col">
          <Link
            href={`/projects/${row.projectId}?tab=payments`}
            className="oh-stretched-link type-body font-medium text-ink hover:text-accent"
          >
            {row.customerName}
          </Link>
          <span className="font-mono text-[0.75rem] text-ink-faint">
            {row.number} · {row.projectCode}
          </span>
        </span>
      ),
    },
    {
      key: 'date',
      header: t('columns.date'),
      cell: (row) => (
        <span className="type-body-sm text-ink-muted">
          {format.dateTime(new Date(`${row.invoiceDate}T12:00:00`), { dateStyle: 'medium' })}
        </span>
      ),
    },
    {
      key: 'tax',
      header: t('columns.tax'),
      hideOnPhone: true,
      cell: (row) => (
        <span className="flex flex-col type-body-sm text-ink-muted">
          <span>{row.placeOfSupply}</span>
          <span className="text-ink-faint">
            {row.supply === 'inter_state'
              ? `${invoiceT('igst')} ${formatInr(row.igstPaise)}`
              : `${invoiceT('cgst')} + ${invoiceT('sgst')} ${formatInr(row.cgstPaise + row.sgstPaise)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'total',
      header: t('columns.total'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end">
          <span className="font-mono text-ink tabular-nums">{formatInr(row.totalPaise)}</span>
          {row.differencePaise !== 0 && (
            <span className="flex items-center gap-1 type-label text-at-risk">
              <TriangleAlert aria-hidden className="size-3.5" />
              {t('differs', { amount: formatInr(Math.abs(row.differencePaise)) })}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <span className="flex items-center gap-1">
          <StatusPill
            size="sm"
            tone={row.status === 'issued' ? 'done' : 'neutral'}
            label={invoiceT(row.status)}
          />
          <a
            href={invoicePdfHref(row.id)}
            target="_blank"
            rel="noopener"
            title={t('open', { number: row.number })}
            className={`${ICON} hover:text-accent`}
          >
            <FileDown aria-hidden className="size-4" />
            <span className="sr-only">{t('open', { number: row.number })}</span>
          </a>
          {canCancel && row.status === 'issued' && (
            <button
              type="button"
              onClick={() => setCancelling(row)}
              title={invoiceT('cancel')}
              className={`${ICON} hover:text-overdue`}
            >
              <Ban aria-hidden className="size-4" />
              <span className="sr-only">{invoiceT('cancel')}</span>
            </button>
          )}
        </span>
      ),
    },
  ];

  const rows = (query.data ?? []).filter((row) => filter === 'all' || row.status === filter);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="type-title-lg text-ink [font-family:var(--font-display)]">{t('title')}</h2>
          <p className="type-body-sm text-ink-faint">{t('description')}</p>
        </div>
        <SegmentedControl
          value={filter}
          onValueChange={setFilter}
          label={t('filterLabel')}
          size="sm"
          options={(['issued', 'cancelled', 'all'] as const).map((value) => ({
            value,
            label: t(`filters.${value}`),
          }))}
        />
      </div>
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<FileText />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
        />
      )}
      <CancelInvoiceDialog invoice={cancelling} onClose={() => setCancelling(null)} />
    </section>
  );
}
