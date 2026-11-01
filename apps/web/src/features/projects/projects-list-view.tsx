'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  PageHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { formatKwp, todayIn } from '@oneohm/shared';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { FileCheck2, SearchX, SunMedium } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { ProjectCard } from './project-card';
import { DEFAULT_FILTERS, filterProjects, isFiltered, type Layout } from './project-filters';
import { ProjectsExtraFilters } from './projects-extra-filters';
import { ProjectsFilterBar } from './projects-filter-bar';
import { ProjectsTable } from './projects-table';
import { useProjectFilters } from './use-project-filters';

function ProjectsSkeleton({ label }: { readonly label: string }) {
  return (
    <SkeletonGroup label={label} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <Skeleton key={card} className="h-72 rounded-lg" />
      ))}
    </SkeletonGroup>
  );
}

/** Every project as cards or as a table, filtered by status, health and type. */
export function ProjectsListView() {
  const t = useTranslations('projects.list');
  const [filters, setFilters] = useProjectFilters();
  const [search, setSearch] = useState(filters.search);
  const query = useQuery({
    queryKey: ['projects'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
  });
  const shown = useMemo(
    () => (query.data ? filterProjects(query.data, filters, todayIn()) : []),
    [query.data, filters],
  );
  const capacity = shown.reduce((sum, project) => sum + project.capacityWp, 0);
  const clear = () => {
    setSearch('');
    setFilters({ ...DEFAULT_FILTERS, sort: filters.sort, view: filters.view });
  };

  return (
    <motion.div
      {...pageEnter}
      className="mx-auto flex w-full max-w-[90rem] min-w-0 flex-col gap-7 py-2"
    >
      <PageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        actions={<PaperworkLink label={t('paperwork')} />}
        description={
          query.data
            ? t(isFiltered(filters) ? 'summaryFiltered' : 'summary', {
                count: shown.length,
                capacity: formatKwp(capacity),
              })
            : undefined
        }
      />
      <ProjectsFilterBar
        filters={filters}
        onChange={setFilters}
        search={search}
        onSearch={setSearch}
      />
      <ProjectsExtraFilters filters={filters} projects={query.data ?? []} onChange={setFilters} />
      <ProjectsBody query={query} shown={shown} layout={filters.view} onClear={clear} />
    </motion.div>
  );
}

/** Loading, error, empty, no match, or the projects as cards or a table. */
function ProjectsBody({
  query,
  shown,
  layout,
  onClear,
}: {
  readonly query: UseQueryResult<ProjectSummary[]>;
  readonly shown: readonly ProjectSummary[];
  readonly layout: Layout;
  readonly onClear: () => void;
}) {
  const t = useTranslations('projects.list');
  if (query.isPending) return <ProjectsSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.length === 0)
    return <EmptyState icon={<SunMedium />} title={t('emptyTitle')} description={t('emptyBody')} />;
  if (shown.length === 0)
    return (
      <EmptyState
        icon={<SearchX />}
        title={t('noMatchTitle')}
        description={t('noMatchBody')}
        action={
          <Button variant="secondary" size="sm" onClick={onClear}>
            {t('clearFilters')}
          </Button>
        }
      />
    );
  if (layout === 'table') return <ProjectsTable projects={shown} />;
  return (
    <ul aria-label={t('title')} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {shown.map((project, index) => (
        <ProjectCard key={project.id} project={project} index={index} />
      ))}
    </ul>
  );
}

/** The statutory paperwork of every project (PRD 3.18) sits with Projects, not Reports. */
function PaperworkLink({ label }: { readonly label: string }) {
  const allowed = useCan('reports.generate', 'documents.view');
  if (!allowed) return null;
  return (
    <Button asChild variant="secondary">
      <Link href="/projects/paperwork">
        <FileCheck2 aria-hidden className="size-4" />
        {label}
      </Link>
    </Button>
  );
}
