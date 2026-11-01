'use client';

import type { QuotationSummary } from '@oneohm/api-contracts';
import {
  Badge,
  Button,
  cn,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  ResponsiveTable,
  SegmentedControl,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr, formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus, Search, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { STATUS_TONE } from './quotation-status';

const FILTERS = ['all', 'draft', 'sent', 'accepted', 'rejected', 'approval'] as const;
type Filter = (typeof FILTERS)[number];

function matches(quotation: QuotationSummary, filter: Filter, term: string): boolean {
  if (filter === 'approval' && !quotation.discountPendingApproval) return false;
  if (filter !== 'all' && filter !== 'approval' && quotation.status !== filter) return false;
  if (!term) return true;
  const haystack = `${quotation.number} ${quotation.customer.name} ${quotation.propertyLabel}`;
  return haystack.toLowerCase().includes(term.toLowerCase());
}

/** The chosen status lives in `?filter=`, so a link from a count opens exactly those quotations. */
function useQuotationFilter(): readonly [Filter, (next: Filter) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get('filter');
  const filter = FILTERS.find((candidate) => candidate === asked) ?? 'all';
  const set = (next: Filter) => {
    const search = new URLSearchParams(params);
    if (next === 'all') search.delete('filter');
    else search.set('filter', next);
    const suffix = search.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };
  return [filter, set];
}

/** Every quotation, newest first, filtered by status and found by number or customer. */
export function QuotationsList() {
  const t = useTranslations('quotations.list');
  const statusT = useTranslations('quotations.status');
  const format = useFormatter();
  const canCreate = useCan('quotations.create');
  const [filter, setFilter] = useQuotationFilter();
  const [term, setTerm] = useState('');
  const query = useQuery({
    queryKey: ['quotations'],
    queryFn: () => expectStatus(api.quotations.listQuotations({ query: {} }), 200),
  });
  const all = query.data ?? [];
  const rows = useMemo(
    () =>
      all
        .filter((quotation) => matches(quotation, filter, term.trim()))
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    [all, filter, term],
  );
  const waiting = all.filter((quotation) => quotation.discountPendingApproval).length;

  const columns: readonly TableColumn<QuotationSummary>[] = [
    {
      key: 'number',
      header: t('columns.quotation'),
      primary: true,
      cell: (row) => (
        <span className="flex min-w-0 flex-col">
          <Link
            href={`/quotations/${row.id}`}
            className="oh-stretched-link font-mono text-[0.8125rem] text-ink hover:text-accent"
          >
            {row.number}
            {row.revision > 1 && <span className="text-ink-faint"> · R{row.revision}</span>}
          </Link>
          <span className="truncate type-body text-ink">{row.customer.name}</span>
        </span>
      ),
    },
    { key: 'site', header: t('columns.site'), hideOnPhone: true, cell: (row) => row.propertyLabel },
    {
      key: 'size',
      header: t('columns.size'),
      cell: (row) => <span className="font-mono">{formatKwp(row.capacityWp)}</span>,
    },
    {
      key: 'effective',
      header: t('columns.effective'),
      align: 'end',
      cell: (row) => (
        <span className="flex flex-col items-end tabular-nums">
          <span className="text-ink">{formatInr(row.effectivePaise)}</span>
          <span className="type-label text-ink-faint">{formatInr(row.totalPaise)}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={STATUS_TONE[row.status]} label={statusT(row.status)} size="sm" />
          {row.discountPendingApproval && <Badge variant="accent">{t('approvalBadge')}</Badge>}
        </span>
      ),
    },
    {
      key: 'date',
      header: t('columns.date'),
      hideOnPhone: true,
      cell: (row) => (
        <span className="type-body-sm text-ink-muted">
          {format.dateTime(new Date(row.createdAt), { day: 'numeric', month: 'short' })}
        </span>
      ),
    },
  ];

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canCreate && (
            <Button asChild variant="primary" leadingIcon={<Plus />}>
              <Link href="/quotations/new">{t('new')}</Link>
            </Button>
          )
        }
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="-mx-1 overflow-x-auto px-1">
          <SegmentedControl
            label={t('filter')}
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={FILTERS.filter(
              (value) => value !== 'approval' || waiting > 0 || filter === 'approval',
            ).map((value) => ({
              value,
              label:
                value === 'approval'
                  ? t('approvalFilter', { count: waiting })
                  : t(`filters.${value}`),
            }))}
          />
        </div>
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          leading={<Search />}
          className="md:w-72"
        />
      </div>
      {waiting > 0 && filter !== 'approval' && (
        <button
          type="button"
          onClick={() => setFilter('approval')}
          className={cn(
            'flex items-center gap-3 rounded-xl bg-review-tint px-4 py-3 text-left type-body-sm text-review',
            'transition-opacity hover:opacity-90',
          )}
        >
          <ShieldAlert aria-hidden className="size-4 shrink-0" />
          {t('approvalCallout', { count: waiting })}
        </button>
      )}
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title={all.length === 0 ? t('emptyTitle') : t('noMatchTitle')}
          description={all.length === 0 ? t('emptyBody') : t('noMatchBody')}
        />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
        />
      )}
    </motion.div>
  );
}
