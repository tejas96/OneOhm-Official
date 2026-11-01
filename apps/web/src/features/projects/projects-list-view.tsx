'use client';

import {
  Button,
  EmptyState,
  PageHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { FileCheck2, SearchX, SunMedium } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCan } from '@/providers/current-user';
import { ProjectCard } from './project-card';
import { DEFAULT_FILTERS, filterProjects, isFiltered } from './project-filters';
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
    () => (query.data ? filterProjects(query.data, filters) : []),
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
      {query.isPending ? (
        <ProjectsSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState icon={<SunMedium />} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t('noMatchTitle')}
          description={t('noMatchBody')}
          action={
            <Button variant="secondary" size="sm" onClick={clear}>
              {t('clearFilters')}
            </Button>
          }
        />
      ) : filters.view === 'table' ? (
        <ProjectsTable projects={shown} />
      ) : (
        <ul
          aria-label={t('title')}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {shown.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </ul>
      )}
    </motion.div>
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
