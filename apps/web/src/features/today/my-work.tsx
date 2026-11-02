'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { cn, EmptyState } from '@oneohm/design-system/web';
import type { UseQueryResult } from '@tanstack/react-query';
import { Coffee } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { TaskCard } from '../projects/tasks/task-card';
import { TODAY_GROUPS, type TodayGroup } from './group-tasks';

export const ACCENT: Readonly<Record<TodayGroup, string>> = {
  first: 'text-overdue',
  overdue: 'text-overdue',
  today: 'text-accent',
  waiting: 'text-waiting',
  upcoming: 'text-ink-faint',
};

/** The person's own tasks: late, due today, held by others, and coming up. */
export function MyWork({
  query,
  groups,
}: {
  readonly query: UseQueryResult<ProjectTask[]>;
  readonly groups: Record<TodayGroup, ProjectTask[]>;
}) {
  const t = useTranslations('today');
  const total = TODAY_GROUPS.reduce((sum, group) => sum + groups[group].length, 0);
  if (query.isPending) return <ListSkeleton label={t('loading')} />;
  if (query.isError) return <LoadError error={query.error} onRetry={() => query.refetch()} />;
  if (total === 0)
    return <EmptyState icon={<Coffee />} title={t('clearTitle')} description={t('clearBody')} />;
  return (
    <>
      {TODAY_GROUPS.filter((group) => group !== 'first' || groups.first.length > 0).map((group) => (
        <section
          key={group}
          id={group}
          aria-labelledby={`${group}-title`}
          className="flex scroll-mt-24 flex-col"
        >
          <div className="flex items-baseline gap-3 border-b border-hairline pb-2.5">
            <h2 id={`${group}-title`} className="type-display-md text-ink">
              {t(`groups.${group}.title`)}
            </h2>
            <span className={cn('font-mono text-[0.8125rem]', ACCENT[group])}>
              {groups[group].length}
            </span>
          </div>
          {groups[group].length === 0 ? (
            <p className="py-4 type-body-sm text-ink-faint">{t(`groups.${group}.empty`)}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {groups[group].map((task, index) => (
                <TaskCard key={task.id} task={task} index={index} showProject />
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}
