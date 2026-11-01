'use client';

import type { CommandCenterQuery, TeamLoad } from '@oneohm/api-contracts';
import {
  Badge,
  ResponsiveTable,
  SegmentedControl,
  type TableColumn,
} from '@oneohm/design-system/web';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { SectionHeading } from './section-heading';

type Row = TeamLoad['people'][number] | TeamLoad['contractors'][number];
type View = 'people' | 'contractors';

const nameOf = (row: Row) => row.name;
const keyOf = (row: Row) => ('userId' in row ? row.userId : row.contractorId);

/** Who carries the work and who is falling behind, per person or per contractor crew. */
export function TeamLoadSection({ query }: { readonly query: CommandCenterQuery }) {
  const t = useTranslations('commandCenter.team');
  const [view, setView] = useState<View>('people');
  const load = useQuery({
    queryKey: ['command-center', 'team', query],
    queryFn: () => expectStatus(api.teamLoad.teamLoad({ query }), 200),
    placeholderData: keepPreviousData,
  });
  const rows: readonly Row[] = load.data ? load.data[view] : [];
  const columns: readonly TableColumn<Row>[] = [
    {
      key: 'name',
      header: view === 'people' ? t('columns.person') : t('columns.contractor'),
      primary: true,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-body font-medium text-ink">{nameOf(row)}</span>
          {'onLeaveToday' in row && row.onLeaveToday && (
            <Badge variant="outline">{t('onLeave')}</Badge>
          )}
          {'crew' in row && (
            <span className="type-body-sm text-ink-faint">{t('crew', { count: row.crew })}</span>
          )}
        </span>
      ),
    },
    {
      key: 'open',
      header: t('columns.open'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{row.open}</span>,
    },
    {
      key: 'overdue',
      header: t('columns.overdue'),
      align: 'end',
      cell: (row) => (
        <span
          className={`tabular-nums ${row.overdue > 0 ? 'font-medium text-overdue' : 'text-ink-faint'}`}
        >
          {row.overdue}
        </span>
      ),
    },
    {
      key: 'today',
      header: t('columns.today'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{row.dueToday}</span>,
    },
    {
      key: 'done',
      header: t('columns.done'),
      align: 'end',
      cell: (row) => <span className="tabular-nums">{row.done}</span>,
    },
    {
      key: 'onTime',
      header: t('columns.onTime'),
      align: 'end',
      cell: (row) => (
        <span className="tabular-nums">
          {row.onTimePercent === null ? '—' : `${row.onTimePercent}%`}
        </span>
      ),
    },
  ];
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <SectionHeading index="03" title={t('title')} />
          <p className="type-body-sm text-ink-muted">{t('description')}</p>
        </div>
        <SegmentedControl<View>
          label={t('viewLabel')}
          size="sm"
          value={view}
          onValueChange={setView}
          options={[
            { value: 'people', label: t('people') },
            { value: 'contractors', label: t('contractors') },
          ]}
        />
      </div>
      {load.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {load.isError && <LoadError error={load.error} onRetry={() => load.refetch()} />}
      {load.data && rows.length === 0 && (
        <p className="type-body-sm text-ink-muted">{t('empty')}</p>
      )}
      {rows.length > 0 && (
        <ResponsiveTable caption={t('title')} columns={columns} rows={rows} rowKey={keyOf} />
      )}
    </section>
  );
}
