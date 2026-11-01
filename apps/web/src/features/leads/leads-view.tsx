'use client';

import type { Lead, LeadListFilter, LeadPage } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  SegmentedControl,
} from '@oneohm/design-system/web';
import { LEAD_STAGES } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { Plus, Search, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadMore } from '@/components/load-more';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { usePagedList } from '@/lib/query/use-paged-list';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useCan } from '@/providers/current-user';
import { LeadCreateDialog } from './lead-create-dialog';
import { leadKeys } from './lead-labels';
import { LeadsTable } from './leads-table';

type Filter = LeadListFilter;
const FILTERS: readonly Filter[] = ['open', 'due', 'unowned', ...LEAD_STAGES, 'all'];

/** Leads per page; more load as the person scrolls. */
const PAGE = 30;

/** The chosen filter lives in `?filter=`, so a link from a count opens exactly those leads. */
function useLeadFilter(): readonly [Filter, (next: Filter) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get('filter');
  const filter = FILTERS.find((candidate) => candidate === asked) ?? 'open';
  const set = (next: Filter) => {
    const search = new URLSearchParams(params);
    if (next === 'open') search.delete('filter');
    else search.set('filter', next);
    const suffix = search.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };
  return [filter, set];
}

/** Every lead with its next action; overdue and today's follow-ups stand out (PRD 3.3). */
export function LeadsView() {
  const t = useTranslations('leads');
  const canManage = useCan('leads.manage');
  const [filter, setFilter] = useLeadFilter();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const term = useDebouncedValue(search.trim());
  const list = useLeadList(filter, term);
  const today = todayIn();
  const counts = list.first;

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8">
      <PageHeader
        eyebrow={
          <span className="font-mono text-[0.75rem] tracking-wide uppercase">{t('eyebrow')}</span>
        }
        title={t('title')}
        description={t('description')}
        actions={
          canManage && (
            <Button variant="primary" leadingIcon={<Plus />} onClick={() => setCreating(true)}>
              {t('new')}
            </Button>
          )
        }
      />
      <dl className="flex flex-wrap gap-x-10 gap-y-3 border-y border-hairline py-4">
        <Figure label={t('figures.showing')} value={counts?.total ?? 0} />
        <Figure label={t('figures.overdue')} value={counts?.overdue ?? 0} tone="overdue" />
        <Figure label={t('figures.today')} value={counts?.dueToday ?? 0} tone="accent" />
      </dl>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <SegmentedControl
            label={t('filterLabel')}
            size="sm"
            value={filter}
            onValueChange={setFilter}
            options={FILTERS.map((value) => ({ value, label: t(`filters.${value}`) }))}
          />
        </div>
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchLabel')}
          leading={<Search />}
          className="lg:w-80"
        />
      </div>
      <LeadsBody
        list={list}
        term={term}
        today={today}
        onCreate={canManage ? () => setCreating(true) : undefined}
      />
      <LeadCreateDialog open={creating} onOpenChange={setCreating} />
    </motion.div>
  );
}

/** The leads the API filters, orders and pages (PRD 9.3), with the late and today counts. */
function useLeadList(filter: Filter, term: string) {
  return usePagedList<Lead, LeadPage>([...leadKeys.all, 'page', filter, term], (cursor) =>
    expectStatus(
      api.lists.leads({
        query: { filter, limit: PAGE, ...(term ? { q: term } : {}), ...(cursor ? { cursor } : {}) },
      }),
      200,
    ),
  );
}

function LeadsBody({
  list,
  term,
  today,
  onCreate,
}: {
  readonly list: ReturnType<typeof useLeadList>;
  readonly term: string;
  readonly today: string;
  readonly onCreate: (() => void) | undefined;
}) {
  const t = useTranslations('leads');
  const { query, items } = list;
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError && items.length === 0)
    return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (items.length > 0)
    return (
      <div className="flex flex-col gap-6">
        <LeadsTable leads={items} today={today} />
        <LoadMore
          shown={items.length}
          total={list.total}
          hasMore={list.hasMore}
          loading={list.loadingMore}
          onMore={list.loadMore}
        />
      </div>
    );
  return (
    <EmptyState
      icon={<Target />}
      title={term ? t('empty.searchTitle') : t('empty.title')}
      description={term ? t('empty.searchBody', { term }) : t('empty.body')}
      action={
        onCreate && !term ? (
          <Button variant="primary" size="sm" leadingIcon={<Plus />} onClick={onCreate}>
            {t('new')}
          </Button>
        ) : undefined
      }
    />
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  readonly label: string;
  readonly value: number;
  readonly tone?: 'overdue' | 'accent';
}) {
  const colour =
    tone === 'overdue' && value > 0
      ? 'text-overdue'
      : tone === 'accent' && value > 0
        ? 'text-accent'
        : 'text-ink';
  return (
    <div className="flex flex-row-reverse items-baseline justify-end gap-2.5">
      <dt className="type-body-sm text-ink-muted">{label}</dt>
      <dd className={`type-display-md tabular-nums ${colour}`}>{value}</dd>
    </div>
  );
}
