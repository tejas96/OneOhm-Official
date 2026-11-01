'use client';

import {
  QUOTATION_LIST_FILTERS,
  type QuotationListFilter,
  type QuotationPage,
  type QuotationSummary,
} from '@oneohm/api-contracts';
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
import { FileText, Plus, Search, ShieldAlert } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadMore } from '@/components/load-more';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { usePagedList } from '@/lib/query/use-paged-list';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useCan } from '@/providers/current-user';
import { STATUS_TONE } from './quotation-status';

const FILTERS = QUOTATION_LIST_FILTERS;
type Filter = QuotationListFilter;

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
  const search = useDebouncedValue(term.trim());
  const list = useQuotationPage(filter, search);
  const waiting = list.first?.waitingApproval ?? 0;
  const none = filter === 'all' && !search;

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
      <QuotationRows list={list} columns={columns} unfiltered={none} />
    </motion.div>
  );
}

/** Newest first, filtered and paged by the API (PRD 9.3). */
function useQuotationPage(filter: Filter, search: string) {
  return usePagedList<QuotationSummary, QuotationPage>(
    ['quotations', 'page', filter, search],
    (cursor) =>
      expectStatus(
        api.lists.quotations({
          query: {
            filter,
            limit: 30,
            ...(search ? { q: search } : {}),
            ...(cursor ? { cursor } : {}),
          },
        }),
        200,
      ),
  );
}

/** Loading, error, none yet, no match, or the table with "Show more". */
function QuotationRows({
  list,
  columns,
  unfiltered,
}: {
  readonly list: ReturnType<typeof useQuotationPage>;
  readonly columns: readonly TableColumn<QuotationSummary>[];
  readonly unfiltered: boolean;
}) {
  const t = useTranslations('quotations.list');
  const { query, items: rows } = list;
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError && rows.length === 0)
    return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<FileText />}
        title={unfiltered ? t('emptyTitle') : t('noMatchTitle')}
        description={unfiltered ? t('emptyBody') : t('noMatchBody')}
      />
    );
  return (
    <div className="flex flex-col gap-6">
      <ResponsiveTable
        caption={t('title')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
      />
      <LoadMore
        shown={rows.length}
        total={list.total}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        onMore={list.loadMore}
      />
    </div>
  );
}
