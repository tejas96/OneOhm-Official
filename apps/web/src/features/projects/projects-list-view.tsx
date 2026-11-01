'use client';

import {
  EmptyState,
  Input,
  PageHeader,
  pageEnter,
  SegmentedControl,
  Select,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Search, SearchX, SunMedium } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import {
  DEFAULT_FILTERS,
  filterProjects,
  type ProjectFilters,
  STATUS_FILTERS,
  TYPE_FILTERS,
  WAITING_FILTERS,
} from './project-filters';
import { ProjectColumnsHeader, ProjectRow } from './project-journey';

/** Every project, filtered by status, type and who it is waiting on, each drawn as its journey. */
export function ProjectsListView() {
  const t = useTranslations('projects.list');
  const [filters, setFilters] = useState<ProjectFilters>(DEFAULT_FILTERS);
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
  });
  const shown = useMemo(
    () => (query.data ? filterProjects(query.data, filters) : []),
    [query.data, filters],
  );
  const set = <K extends keyof ProjectFilters>(key: K, value: ProjectFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const capacity = shown.reduce((sum, project) => sum + project.capacityWp, 0);

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-8 py-2">
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={
          query.data
            ? t('summary', { count: shown.length, capacity: formatKwp(capacity) })
            : undefined
        }
      />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <SegmentedControl
          label={t('filters.status')}
          size="sm"
          value={filters.status}
          onValueChange={(value) => set('status', value)}
          options={STATUS_FILTERS.map((value) => ({ value, label: t(`status.${value}`) }))}
          className="self-start"
        />
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_12rem_14rem]">
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => set('search', event.target.value)}
            placeholder={t('filters.search')}
            aria-label={t('filters.search')}
            leading={<Search />}
          />
          <Select
            label={t('filters.type')}
            value={filters.type}
            onValueChange={(value) => set('type', value)}
            options={TYPE_FILTERS.map((value) => ({ value, label: t(`type.${value}`) }))}
          />
          <Select
            label={t('filters.waiting')}
            value={filters.waiting}
            onValueChange={(value) => set('waiting', value)}
            options={WAITING_FILTERS.map((value) => ({ value, label: t(`waiting.${value}`) }))}
          />
        </div>
      </div>
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<SunMedium />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : shown.length === 0 ? (
        <EmptyState icon={<SearchX />} title={t('noMatchTitle')} description={t('noMatchBody')} />
      ) : (
        <section aria-label={t('title')} className="flex flex-col">
          <ProjectColumnsHeader
            project={t('columns.project')}
            statusNext={t('columns.statusNext')}
          />
          <ul className="flex flex-col divide-y divide-hairline">
            {shown.map((project, index) => (
              <ProjectRow key={project.id} project={project} index={index} />
            ))}
          </ul>
        </section>
      )}
    </motion.div>
  );
}
