'use client';

import { Input, SegmentedControl, Select } from '@oneohm/design-system/web';
import { LayoutGrid, Rows3, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import {
  HEALTH_FILTERS,
  type ProjectFilters,
  SORTS,
  STATUS_FILTERS,
  TYPE_FILTERS,
} from './project-filters';

/**
 * One row of filters above the list; every change is written to the URL. The search box
 * is a draft the page owns (so Clear filters can empty it) and reaches the URL 300 ms
 * after typing stops.
 */
export function ProjectsFilterBar({
  filters,
  onChange,
  search,
  onSearch,
}: {
  readonly filters: ProjectFilters;
  readonly onChange: (patch: Partial<ProjectFilters>) => void;
  readonly search: string;
  readonly onSearch: (search: string) => void;
}) {
  const t = useTranslations('projects.list');
  useEffect(() => {
    if (search.trim() === filters.search) return;
    const timer = window.setTimeout(() => onChange({ search: search.trim() }), 300);
    return () => window.clearTimeout(timer);
  }, [search, filters.search, onChange]);

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1 xl:max-w-sm xl:min-w-48">
        <Input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={t('filters.search')}
          aria-label={t('filters.search')}
          leading={<Search aria-hidden />}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center xl:flex-nowrap">
        <Select
          label={t('filters.status')}
          value={filters.status}
          onValueChange={(status) => onChange({ status })}
          options={STATUS_FILTERS.map((value) => ({ value, label: t(`status.${value}`) }))}
          className="sm:w-36"
        />
        <Select
          label={t('filters.health')}
          value={filters.health}
          onValueChange={(health) => onChange({ health })}
          options={HEALTH_FILTERS.map((value) => ({ value, label: t(`health.${value}`) }))}
          className="sm:w-44"
        />
        <Select
          label={t('filters.type')}
          value={filters.type}
          onValueChange={(type) => onChange({ type })}
          options={TYPE_FILTERS.map((value) => ({ value, label: t(`type.${value}`) }))}
          className="sm:w-36"
        />
        <Select
          label={t('filters.sort')}
          value={filters.sort}
          onValueChange={(sort) => onChange({ sort })}
          options={SORTS.map((value) => ({ value, label: t(`sort.${value}`) }))}
          className="sm:w-48"
        />
      </div>
      <SegmentedControl
        label={t('filters.layout')}
        value={filters.view}
        onValueChange={(view) => onChange({ view })}
        options={[
          {
            value: 'cards',
            label: t('layout.cards'),
            icon: <LayoutGrid aria-hidden />,
            iconOnly: true,
          },
          { value: 'table', label: t('layout.table'), icon: <Rows3 aria-hidden />, iconOnly: true },
        ]}
        className="self-start xl:ml-auto"
      />
    </div>
  );
}
