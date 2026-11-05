'use client';

import type { TeamCapacity } from '@oneohm/api-contracts';
import { EmptyState, ResponsiveTable, type TableColumn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Gauge } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { PersonChip } from '../person-chip';
import { useWorkforceFormat } from '../workforce-format';
import { LoadCell } from './overload-badge';

type Row = TeamCapacity['people'][number];

export const CAPACITY_KEY = ['team', 'capacity'] as const;

function WeekCell({
  due,
  leaveDays,
  pendingDays,
}: {
  readonly due: number;
  readonly leaveDays: number;
  readonly pendingDays: number;
}) {
  const t = useTranslations('team.workload');
  return (
    <span className="inline-flex flex-col items-end md:items-start">
      <span
        className={
          due > 0
            ? 'font-mono text-[0.875rem] text-ink tabular-nums'
            : 'font-mono text-[0.875rem] text-ink-faint tabular-nums'
        }
      >
        {due}
      </span>
      {leaveDays > 0 && (
        <span className="type-label text-waiting">{t('leaveDays', { count: leaveDays })}</span>
      )}
      {pendingDays > 0 && (
        <span className="type-label text-ink-faint">
          {t('pendingLeave', { count: pendingDays })}
        </span>
      )}
    </span>
  );
}

/**
 * Who carries how much (PRD 3.12): open tasks against each person's limit, and what
 * falls due in each of the next four weeks beside their leave.
 */
export function WorkloadTab() {
  const t = useTranslations('team.workload');
  const format = useWorkforceFormat();
  const query = useQuery({
    queryKey: CAPACITY_KEY,
    queryFn: () => expectStatus(api.engagement.teamCapacity(), 200),
  });

  if (query.isPending) return <ListSkeleton label={t('loading')} rows={4} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  const { weeks, people } = query.data;
  const over = people.filter((row) => row.state === 'over').length;

  const columns: readonly TableColumn<Row>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (row) => <PersonChip person={row.user} detail={row.roles.join(' · ')} />,
    },
    {
      key: 'open',
      header: t('columns.open'),
      cell: (row) => <LoadCell open={row.open} limit={row.limit} state={row.state} />,
    },
    {
      key: 'overdue',
      header: t('columns.overdue'),
      align: 'end',
      cell: (row) => (
        <span
          className={
            row.overdue > 0
              ? 'font-mono text-[0.875rem] text-overdue tabular-nums'
              : 'font-mono text-[0.875rem] text-ink-faint tabular-nums'
          }
        >
          {row.overdue}
        </span>
      ),
    },
    ...weeks.map((week, index) => ({
      key: `week-${index}`,
      header: index === 0 ? t('thisWeek') : format.range(week.from, week.to),
      align: 'end' as const,
      cell: (row: Row) => (
        <WeekCell
          due={row.dueByWeek[index] ?? 0}
          leaveDays={row.leaveDaysByWeek[index] ?? 0}
          pendingDays={row.pendingLeaveDaysByWeek[index] ?? 0}
        />
      ),
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="max-w-3xl type-body text-ink-muted">{t('intro')}</p>
        {over > 0 && <p className="type-body-sm text-overdue">{t('overCount', { count: over })}</p>}
      </div>
      {people.length === 0 ? (
        <EmptyState icon={<Gauge />} title={t('empty')} />
      ) : (
        <ResponsiveTable
          caption={t('caption')}
          columns={columns}
          rows={people}
          rowKey={(row) => row.user.id}
        />
      )}
    </div>
  );
}
