'use client';

import {
  Button,
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  SegmentedControl,
} from '@oneohm/design-system/web';
import type { LeadStage } from '@oneohm/domain';
import { LEAD_STAGES } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, Target } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useCan } from '@/providers/current-user';
import { LeadCreateDialog } from './lead-create-dialog';
import { isOpenLead, leadKeys } from './lead-labels';
import { LeadsTable } from './leads-table';

type Filter = 'open' | LeadStage | 'all';
const FILTERS: readonly Filter[] = ['open', ...LEAD_STAGES, 'all'];

/** Every lead with its next action; overdue and today's follow-ups stand out (PRD 3.3). */
export function LeadsView() {
  const t = useTranslations('leads');
  const canManage = useCan('leads.manage');
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const term = useDebouncedValue(search.trim());
  const query = useLeadList(filter, term);
  const today = todayIn();
  const rows = query.data ?? [];
  const overdue = rows.filter((lead) => lead.overdue).length;
  const dueToday = rows.filter(
    (lead) => isOpenLead(lead) && !lead.overdue && lead.nextActionOn === today,
  ).length;

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
        <Figure label={t('figures.showing')} value={rows.length} />
        <Figure label={t('figures.overdue')} value={overdue} tone="overdue" />
        <Figure label={t('figures.today')} value={dueToday} tone="accent" />
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
        query={query}
        term={term}
        today={today}
        onCreate={canManage ? () => setCreating(true) : undefined}
      />
      <LeadCreateDialog open={creating} onOpenChange={setCreating} />
    </motion.div>
  );
}

function useLeadList(filter: Filter, term: string) {
  return useQuery({
    queryKey: [...leadKeys.all, 'list', filter, term],
    queryFn: () =>
      expectStatus(
        api.crm.listLeads({
          query: {
            ...(filter === 'open' ? { open: true } : {}),
            ...(filter !== 'open' && filter !== 'all' ? { stage: filter } : {}),
            ...(term ? { search: term } : {}),
          },
        }),
        200,
      ),
    placeholderData: (previous) => previous,
  });
}

function LeadsBody({
  query,
  term,
  today,
  onCreate,
}: {
  readonly query: ReturnType<typeof useLeadList>;
  readonly term: string;
  readonly today: string;
  readonly onCreate: (() => void) | undefined;
}) {
  const t = useTranslations('leads');
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length > 0) return <LeadsTable leads={query.data} today={today} />;
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
