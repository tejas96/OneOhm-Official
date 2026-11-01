'use client';

import type { LeaveRequestRecord } from '@oneohm/api-contracts';
import {
  EmptyState,
  ResponsiveTable,
  SegmentedControl,
  Select,
  type TableColumn,
} from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PersonChip } from '../person-chip';
import { daysOf, useWorkforceFormat } from '../workforce-format';
import { LeaveKind, LeaveStatus } from './leave-facts';

type When = 'upcoming' | 'past';
type Status = 'all' | LeaveRequestRecord['status'];
const STATUSES = ['all', 'approved', 'pending', 'rejected', 'cancelled'] as const;

/** Everyone's leave, upcoming (soonest first) or past (latest first), by status. */
export function LeaveHistory({ requests }: { readonly requests: readonly LeaveRequestRecord[] }) {
  const t = useTranslations('team.leave.history');
  const statusT = useTranslations('team.leave.status');
  const format = useWorkforceFormat();
  const today = todayIn();
  const [when, setWhen] = useState<When>('upcoming');
  const [status, setStatus] = useState<Status>('all');

  const rows = requests
    .filter((item) => (when === 'upcoming' ? item.toDate >= today : item.toDate < today))
    .filter((item) => status === 'all' || item.status === status)
    .sort((a, b) =>
      when === 'upcoming'
        ? a.fromDate.localeCompare(b.fromDate)
        : b.fromDate.localeCompare(a.fromDate),
    );

  const columns: readonly TableColumn<LeaveRequestRecord>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (item) => <PersonChip person={item.user} />,
    },
    { key: 'kind', header: t('columns.kind'), cell: (item) => <LeaveKind leave={item} /> },
    {
      key: 'dates',
      header: t('columns.dates'),
      cell: (item) => (
        <span className="type-body-sm text-ink">{format.range(item.fromDate, item.toDate)}</span>
      ),
    },
    {
      key: 'days',
      header: t('columns.days'),
      align: 'end',
      cell: (item) => (
        <span className="font-mono text-[0.875rem] text-ink tabular-nums">
          {daysOf(item.halfDays)}
        </span>
      ),
    },
    {
      key: 'backup',
      header: t('columns.backup'),
      cell: (item) =>
        item.backup ? (
          <span className="type-body-sm text-ink">{item.backup.fullName}</span>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('noBackup')}</span>
        ),
    },
    { key: 'status', header: t('columns.status'), cell: (item) => <LeaveStatus leave={item} /> },
  ];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="type-title-lg text-ink">{t('title')}</h2>
        <p className="type-body-sm text-ink-faint">{t('description')}</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl
          value={when}
          onValueChange={setWhen}
          label={t('whenLabel')}
          size="sm"
          options={[
            { value: 'upcoming', label: t('upcoming') },
            { value: 'past', label: t('past') },
          ]}
          className="self-start"
        />
        <Select
          value={status}
          onValueChange={setStatus}
          label={t('statusLabel')}
          className="sm:w-52"
          options={STATUSES.map((value) => ({
            value,
            label: value === 'all' ? t('allStatuses') : statusT(value),
          }))}
        />
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays />}
          title={when === 'upcoming' ? t('emptyUpcoming') : t('emptyPast')}
        />
      ) : (
        <ResponsiveTable
          caption={t('title')}
          columns={columns}
          rows={rows}
          rowKey={(item) => item.id}
        />
      )}
    </section>
  );
}
