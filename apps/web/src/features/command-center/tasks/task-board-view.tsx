'use client';

import { COMMAND_CENTER_PERIODS, TASK_BOARD_VIEWS, type TaskBoard } from '@oneohm/api-contracts';
import { EmptyState, PageHeader, pageEnter, Select } from '@oneohm/design-system/web';
import { WAITING_PARTIES } from '@oneohm/domain';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ListChecks, X } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { TaskBoardTable } from './task-board-table';
import { type Narrowing, useTaskBoardFilters } from './use-task-board-filters';

const ANY = 'any';

/** Names for the chips, read from the rows themselves; a generic word when none match. */
function chipName(key: Narrowing, id: string, data: TaskBoard | undefined): string | null {
  const rows = data?.rows ?? [];
  if (key === 'project') return rows.find((row) => row.projectId === id)?.projectCode ?? null;
  if (key === 'assignee')
    return rows.find((row) => row.assignee?.id === id)?.assignee?.name ?? null;
  if (key === 'contractor') return rows.find((row) => row.contractorName)?.contractorName ?? null;
  if (key === 'manager') return rows.find((row) => row.managerName)?.managerName ?? null;
  return null;
}

/**
 * Tasks across every project behind the command centre's task numbers (PRD 3.1 and the
 * drill-down rule): pick open, overdue, unowned, waiting, finished or late, narrow by
 * who it waits on, and follow any link here with its filters already set.
 */
export function TaskBoardView() {
  const t = useTranslations('commandCenter.taskBoard');
  const periodT = useTranslations('commandCenter.filters.period');
  const typeT = useTranslations('commandCenter.filters.types');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const { query, narrowing, narrowingValue, set } = useTaskBoardFilters();
  const board = useQuery({
    queryKey: ['command-center', 'tasks', query],
    queryFn: () => expectStatus(api.teamLoad.taskBoard({ query }), 200),
    placeholderData: keepPreviousData,
  });
  const show = query.show ?? 'open';
  const lookBack = show === 'done' || show === 'late';
  const summaryKey =
    query.projectId && show === 'done' ? 'summaryAll' : lookBack ? 'summaryPeriod' : 'summary';
  const short = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00`), { day: 'numeric', month: 'short' });
  const chipLabel = (key: Narrowing) => {
    const value = narrowingValue(key);
    if (key === 'type') return t('chips.type', { name: typeT(value) });
    return t(`chips.${key}`, { name: chipName(key, value, board.data) ?? t('chips.chosen') });
  };
  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 py-2">
      <Link
        href="/command-center"
        className="inline-flex items-center gap-1.5 self-start type-body-sm text-ink-muted hover:text-accent"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {t('back')}
      </Link>
      <PageHeader
        title={t(`titles.${show}`)}
        description={
          board.data
            ? t(summaryKey, {
                count: board.data.rows.length,
                start: short(board.data.range.start),
                end: short(board.data.range.end),
              })
            : undefined
        }
      />
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          label={t('filters.show')}
          value={show}
          onValueChange={(value) => set('show', value === 'open' ? null : value)}
          options={TASK_BOARD_VIEWS.map((value) => ({ value, label: t(`titles.${value}`) }))}
          className="sm:w-64"
        />
        <Select
          label={t('filters.party')}
          value={query.party ?? ANY}
          onValueChange={(value) => set('party', value === ANY ? null : value)}
          options={[
            { value: ANY, label: t('filters.anyParty') },
            ...WAITING_PARTIES.map((value) => ({ value, label: partyT(value) })),
          ]}
          className="sm:w-52"
        />
        {lookBack && summaryKey !== 'summaryAll' && (
          <Select
            label={t('filters.period')}
            value={query.period ?? 'this_month'}
            onValueChange={(value) => set('period', value === 'this_month' ? null : value)}
            options={COMMAND_CENTER_PERIODS.map((value) => ({ value, label: periodT(value) }))}
            className="sm:w-52"
          />
        )}
      </div>
      {narrowing.length > 0 && (
        <ul aria-label={t('chips.label')} className="-mt-2 flex flex-wrap gap-2">
          {narrowing.map((key) => (
            <li key={key}>
              <button
                type="button"
                onClick={() => set(key, null)}
                className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-3 py-1 type-body-sm text-ink hover:border-rule"
              >
                {chipLabel(key)}
                <X aria-hidden className="size-3.5 text-ink-faint" />
                <span className="sr-only">{t('chips.remove')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="type-body-sm text-ink-muted">
        {t(summaryKey === 'summaryAll' ? 'explain.doneProject' : `explain.${show}`)}
      </p>
      {board.isPending && <ListSkeleton label={t('loading')} rows={6} />}
      {board.isError && !board.data && (
        <LoadError error={board.error} onRetry={() => board.refetch()} />
      )}
      {board.data && board.data.rows.length === 0 && (
        <EmptyState icon={<ListChecks />} title={t('emptyTitle')} description={t('emptyBody')} />
      )}
      {board.data && board.data.rows.length > 0 && (
        <div className={board.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
          <TaskBoardTable rows={board.data.rows} />
          {board.data.truncated && (
            <p className="pt-3 type-body-sm text-ink-faint">{t('truncated')}</p>
          )}
        </div>
      )}
    </motion.div>
  );
}
