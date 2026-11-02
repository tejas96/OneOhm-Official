'use client';

import type { MonthlyRow } from '@oneohm/api-contracts';
import {
  Button,
  EmptyState,
  ResponsiveTable,
  Select,
  StatusPill,
  type TableColumn,
} from '@oneohm/design-system/web';
import { formatInr } from '@oneohm/shared';
import { ArrowDownRight, ArrowUpRight, CalendarCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { DecideMonthDialog } from './decide-month-dialog';
import { MonthlyPersonSheet } from './monthly-person-sheet';
import { reviewableMonths, useMonthlyReview } from './use-monthly';
import { weakSpot } from './weak-spot';

const percent = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}%`);

/**
 * The owner's month per person (spec 3.7): points against last month, on-time and
 * first-time-right rates, what needs attention, and the decision: no money or a bonus
 * proposal that still needs payment approval.
 */
export function MonthlyReview() {
  const t = useTranslations('team.points.monthly');
  const format = useFormatter();
  const me = useCurrentUser();
  const canDecide = useCan('people.manage');
  const months = reviewableMonths();
  const [month, setMonth] = useState(months[0] ?? '');
  const [person, setPerson] = useState<MonthlyRow['user'] | null>(null);
  const [deciding, setDeciding] = useState<MonthlyRow | null>(null);
  const query = useMonthlyReview(month);
  const label = (value: string) =>
    format.dateTime(new Date(`${value}-15T12:00:00Z`), { month: 'long', year: 'numeric' });

  const columns: readonly TableColumn<MonthlyRow>[] = [
    {
      key: 'person',
      header: t('columns.person'),
      primary: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => setPerson(row.user)}
          className="text-left type-body font-medium text-ink hover:text-accent hover:underline"
        >
          {row.user.fullName}
        </button>
      ),
    },
    {
      key: 'points',
      header: t('columns.points'),
      align: 'end',
      cell: (row) => (
        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
          {row.points}
          {row.points !== row.previousPoints &&
            (row.points > row.previousPoints ? (
              <ArrowUpRight aria-label={t('up')} className="size-3.5 text-on-track" />
            ) : (
              <ArrowDownRight aria-label={t('down')} className="size-3.5 text-at-risk" />
            ))}
        </span>
      ),
    },
    { key: 'tasks', header: t('columns.tasks'), align: 'end', cell: (row) => row.tasksJudged },
    {
      key: 'onTime',
      header: t('columns.onTime'),
      align: 'end',
      cell: (row) => percent(row.onTimeRate),
    },
    {
      key: 'firstTime',
      header: t('columns.firstTime'),
      align: 'end',
      cell: (row) => percent(row.firstTimeRate),
    },
    {
      key: 'rating',
      header: t('columns.rating'),
      align: 'end',
      hideOnPhone: true,
      cell: (row) => (row.ratingAverage === null ? '–' : `${row.ratingAverage.toFixed(1)}★`),
    },
    {
      key: 'attention',
      header: t('columns.attention'),
      hideOnPhone: true,
      cell: (row) => {
        const spot = weakSpot(row);
        return spot ? (
          <span className="type-body-sm text-at-risk">
            {t(`attention.${spot.part}`, { rate: percent(spot.rate) })}
          </span>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('attention.none')}</span>
        );
      },
    },
    {
      key: 'decision',
      header: t('columns.decision'),
      cell: (row) =>
        row.review ? (
          <StatusPill
            size="sm"
            tone={
              row.review.decision === 'none'
                ? 'neutral'
                : row.review.status === 'approved'
                  ? 'done'
                  : 'review'
            }
            label={
              row.review.decision === 'none'
                ? t('decided.none')
                : t(`decided.bonus.${row.review.status ?? 'pending'}`, {
                    amount: formatInr(row.review.amountPaise ?? 0),
                  })
            }
          />
        ) : canDecide && row.user.id !== me.id ? (
          <Button size="sm" variant="secondary" onClick={() => setDeciding(row)}>
            {t('decide')}
          </Button>
        ) : (
          <span className="type-body-sm text-ink-faint">{t('open')}</span>
        ),
    },
  ];

  return (
    <section aria-labelledby="monthly-review-title" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="monthly-review-title" className="type-title-lg text-ink">
            {t('title')}
          </h2>
          <p className="max-w-2xl type-body-sm text-ink-muted">{t('intro')}</p>
        </div>
        <Select
          value={month}
          onValueChange={setMonth}
          options={months.map((value) => ({ value, label: label(value) }))}
          aria-label={t('month')}
          className="sm:w-52"
        />
      </div>
      {query.isPending && <ListSkeleton label={t('loading')} rows={4} />}
      {query.isError && <LoadError error={query.error} onRetry={() => query.refetch()} />}
      {query.data &&
        (query.data.rows.length === 0 ? (
          <EmptyState icon={<CalendarCheck />} title={t('empty', { month: label(month) })} />
        ) : (
          // Many columns: the table scrolls sideways in its own box, never the page.
          <div className="min-w-0 overflow-x-auto">
            <ResponsiveTable
              caption={t('caption', { month: label(month) })}
              columns={columns}
              rows={query.data.rows}
              rowKey={(row) => row.user.id}
            />
          </div>
        ))}
      <MonthlyPersonSheet
        person={person}
        month={month}
        monthLabel={label(month)}
        onClose={() => setPerson(null)}
      />
      <DecideMonthDialog
        row={deciding}
        month={month}
        monthLabel={label(month)}
        onClose={() => setDeciding(null)}
      />
    </section>
  );
}
