'use client';

import type { ProjectPage, ProjectSummary } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  PageHeader,
  pageEnter,
  Skeleton,
  SkeletonGroup,
} from '@oneohm/design-system/web';
import { formatKwp } from '@oneohm/shared';
import { FileCheck2, SearchX, SunMedium } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LoadMore } from '@/components/load-more';
import { LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { usePagedList } from '@/lib/query/use-paged-list';
import { useCan } from '@/providers/current-user';
import { ProjectCard } from './project-card';
import { DEFAULT_FILTERS, isFiltered, type Layout, pageQueryOf } from './project-filters';
import { ProjectsExtraFilters } from './projects-extra-filters';
import { ProjectsFilterBar } from './projects-filter-bar';
import { ProjectsTable } from './projects-table';
import { useProjectFilters } from './use-project-filters';

/** Cards per page: four rows of three on a wide screen. */
const PAGE = 24;

function ProjectsSkeleton({ label }: { readonly label: string }) {
  return (
    <SkeletonGroup label={label} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((card) => (
        <Skeleton key={card} className="h-72 rounded-lg" />
      ))}
    </SkeletonGroup>
  );
}

/**
 * Projects as cards or as a table, filtered by status, health and type. The API filters,
 * orders and pages them (PRD 9.3); more arrive as the person scrolls.
 */
export function ProjectsListView() {
  const t = useTranslations('projects.list');
  const [filters, setFilters] = useProjectFilters();
  const [search, setSearch] = useState(filters.search);
  const asked = pageQueryOf(filters);
  const list = usePagedList<ProjectSummary, ProjectPage>(['projects', 'page', asked], (cursor) =>
    expectStatus(
      api.lists.projects({ query: { ...asked, limit: PAGE, ...(cursor ? { cursor } : {}) } }),
      200,
    ),
  );
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
          list.first
            ? t(isFiltered(filters) ? 'summaryFiltered' : 'summary', {
                count: list.total,
                capacity: formatKwp(list.first.capacityWp),
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
      <ProjectsExtraFilters
        filters={filters}
        managerName={list.first?.managerName ?? null}
        onChange={setFilters}
      />
      <ProjectsBody
        list={list}
        filtered={isFiltered(filters)}
        layout={filters.view}
        onClear={clear}
        onShowAll={() => setFilters({ status: 'all' })}
      />
    </motion.div>
  );
}

/** Loading, error, empty, no match, or the projects as cards or a table. */
function ProjectsBody({
  list,
  filtered,
  layout,
  onClear,
  onShowAll,
}: {
  readonly list: ReturnType<typeof usePagedList<ProjectSummary, ProjectPage>>;
  readonly filtered: boolean;
  readonly layout: Layout;
  readonly onClear: () => void;
  readonly onShowAll: () => void;
}) {
  const t = useTranslations('projects.list');
  const { query, items } = list;
  if (query.isPending) return <ProjectsSkeleton label={t('loading')} />;
  if (query.isError && items.length === 0)
    return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (items.length === 0 && !filtered)
    return (
      <EmptyState
        icon={<SunMedium />}
        title={t('emptyLiveTitle')}
        description={t('emptyLiveBody')}
        action={
          <Button variant="secondary" size="sm" onClick={onShowAll}>
            {t('showAll')}
          </Button>
        }
      />
    );
  if (items.length === 0)
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
  return (
    <div className="flex flex-col gap-6">
      {layout === 'table' ? (
        <ProjectsTable projects={items} />
      ) : (
        <ul
          aria-label={t('title')}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {items.map((project, index) => (
            <ProjectCard key={project.id} project={project} index={index} />
          ))}
        </ul>
      )}
      <LoadMore
        shown={items.length}
        total={list.total}
        hasMore={list.hasMore}
        loading={list.loadingMore}
        onMore={list.loadMore}
      />
    </div>
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
