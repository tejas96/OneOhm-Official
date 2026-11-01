'use client';

import type { CommandCenterQuery } from '@oneohm/api-contracts';
import { ResponsiveTable, SegmentedControl } from '@oneohm/design-system/web';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { SectionHeading } from './section-heading';
import { type TeamRow, type TeamView, teamRowKey, useTeamColumns } from './team-load-columns';

/**
 * Who carries the work and who is falling behind, per person, per department (their
 * main role) or per contractor crew. A person opens their tasks, a crew its page, and a
 * department the people in it.
 */
export function TeamLoadSection({ query }: { readonly query: CommandCenterQuery }) {
  const t = useTranslations('commandCenter.team');
  const [view, setView] = useState<TeamView>('people');
  const [department, setDepartment] = useState<string | null | undefined>(undefined);
  const load = useQuery({
    queryKey: ['command-center', 'team', query],
    queryFn: () => expectStatus(api.teamLoad.teamLoad({ query }), 200),
    placeholderData: keepPreviousData,
  });
  const openDepartment = (name: string | null) => {
    setDepartment(name);
    setView('people');
  };
  const columns = useTeamColumns(view, query, openDepartment);
  const all: readonly TeamRow[] = load.data ? load.data[view] : [];
  const rows =
    view === 'people' && department !== undefined
      ? all.filter((row) => 'department' in row && row.department === department)
      : all;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading index="03" title={t('title')} />
          <p className="type-body-sm text-ink-muted">{t('description')}</p>
        </div>
        <SegmentedControl<TeamView>
          label={t('viewLabel')}
          size="sm"
          value={view}
          onValueChange={(next) => {
            setView(next);
            setDepartment(undefined);
          }}
          options={[
            { value: 'people', label: t('people') },
            { value: 'departments', label: t('departments') },
            { value: 'contractors', label: t('contractors') },
          ]}
        />
      </div>
      {view === 'departments' && <p className="type-label text-ink-faint">{t('departmentNote')}</p>}
      {view === 'people' && department !== undefined && (
        <button
          type="button"
          onClick={() => setDepartment(undefined)}
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-hairline bg-raised px-3 py-1 type-body-sm text-ink hover:border-rule"
        >
          {t('inDepartment', { name: department ?? t('noDepartment') })}
          <X aria-hidden className="size-3.5 text-ink-faint" />
          <span className="sr-only">{t('showEveryone')}</span>
        </button>
      )}
      {load.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {load.isError && <LoadError error={load.error} onRetry={() => load.refetch()} />}
      {load.data && rows.length === 0 && (
        <p className="type-body-sm text-ink-muted">{t('empty')}</p>
      )}
      {rows.length > 0 && (
        <ResponsiveTable caption={t('title')} columns={columns} rows={rows} rowKey={teamRowKey} />
      )}
    </section>
  );
}
