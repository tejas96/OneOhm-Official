'use client';

import type { ReportOverview } from '@oneohm/api-contracts';
import {
  EmptyState,
  Input,
  listItemEnter,
  PageHeader,
  pageEnter,
  SegmentedControl,
} from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, Search, SearchX } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { ReportChip } from './report-chip';

const FILTERS = ['all', 'missing', 'ready'] as const;
type Filter = (typeof FILTERS)[number];

const hasMissing = (row: ReportOverview) => row.reports.some((r) => r.status === 'missing');

/**
 * Every project's statutory paperwork in one grid: print what is ready, and see exactly
 * which detail (and which task) holds back the rest.
 */
export function ReportsView() {
  const t = useTranslations('reports');
  const shortName = (report: ReportOverview['reports'][number]) =>
    t.has(`short.${report.key}`) ? t(`short.${report.key}`) : report.name;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['reports-overview'],
    queryFn: () => expectStatus(api.reports.reportsOverview(), 200),
  });
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (query.data ?? []).filter((row) => {
      if (filter === 'missing' && !hasMissing(row)) return false;
      if (filter === 'ready' && hasMissing(row)) return false;
      return !term || `${row.code} ${row.name} ${row.place}`.toLowerCase().includes(term);
    });
  }, [query.data, filter, search]);
  const columns = query.data?.[0]?.reports ?? [];
  const ready = (query.data ?? [])
    .flatMap((row) => row.reports)
    .filter((r) => r.status === 'ready');

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={query.data ? t('summary', { ready: ready.length }) : t('description')}
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <SegmentedControl
          label={t('filterLabel')}
          size="sm"
          value={filter}
          onValueChange={setFilter}
          options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
          className="self-start"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('search')}
          aria-label={t('search')}
          leading={<Search />}
          className="md:w-80"
        />
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data && query.data.length === 0 && (
        <EmptyState icon={<FileCheck2 />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {query.data && query.data.length > 0 && rows.length === 0 && (
        <EmptyState icon={<SearchX />} title={t('noMatch')} />
      )}
      {rows.length > 0 && (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[minmax(0,15rem)_repeat(6,minmax(0,1fr))] gap-3 border-b border-hairline pb-3 xl:grid">
            <span className="type-overline text-ink-faint uppercase">{t('project')}</span>
            {columns.map((report) => (
              <span
                key={report.key}
                title={report.name}
                className="truncate type-overline text-ink-faint uppercase"
              >
                {shortName(report)}
              </span>
            ))}
          </div>
          <ul className="flex flex-col divide-y divide-hairline">
            {rows.map((row, index) => (
              <motion.li
                key={row.projectId}
                {...listItemEnter(index)}
                className="grid gap-3 py-4 xl:grid-cols-[minmax(0,15rem)_repeat(6,minmax(0,1fr))] xl:items-center"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-mono text-[0.75rem] text-ink-faint">{row.code}</span>
                  <Link
                    href={`/projects/${row.projectId}`}
                    className="truncate type-title-md font-normal text-ink [font-family:var(--font-display)] hover:text-accent"
                  >
                    {row.name}
                  </Link>
                  <span className="truncate type-body-sm text-ink-faint">{row.place}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:contents">
                  {row.reports.map((report) => (
                    <div key={report.key} className="flex min-w-0 flex-col gap-1">
                      <span className="truncate type-label text-ink-muted xl:hidden">
                        {shortName(report)}
                      </span>
                      <ReportChip projectId={row.projectId} report={report} />
                    </div>
                  ))}
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
