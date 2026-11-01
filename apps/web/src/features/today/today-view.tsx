'use client';

import { cn, EmptyState, pageEnter } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { useQuery } from '@tanstack/react-query';
import { Coffee } from 'lucide-react';
import { motion } from 'motion/react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { ListSkeleton, LoadError } from '@/components/query-state';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCurrentUser } from '@/providers/current-user';
import { useGreeting } from '../command-center/use-greeting';
import { TaskCard } from '../projects/tasks/task-card';
import { groupTasks, TODAY_GROUPS, type TodayGroup } from './group-tasks';

const ACCENT: Readonly<Record<TodayGroup, string>> = {
  overdue: 'text-overdue',
  today: 'text-accent',
  waiting: 'text-waiting',
  upcoming: 'text-ink-faint',
};

/** The signed-in person's work: what is late, what is due today, what is held, what is next. */
export function TodayView() {
  const t = useTranslations('today');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const greeting = useGreeting();
  const user = useCurrentUser();
  const query = useQuery({
    queryKey: ['tasks', 'mine'],
    queryFn: () => expectStatus(api.tasks.myTasks(), 200),
    refetchInterval: 60_000,
  });
  const groups = groupTasks(query.data ?? [], todayIn());
  const firstName = user.fullName.split(/\s+/)[0] ?? user.fullName;
  const total = TODAY_GROUPS.reduce((sum, group) => sum + groups[group].length, 0);

  return (
    <motion.div {...pageEnter} className="mx-auto flex w-full max-w-5xl flex-col gap-10 py-2">
      <header className="flex flex-col gap-5">
        <p className="font-mono text-[0.75rem] tracking-wide text-ink-faint uppercase">
          {format.dateTime(now, { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 className="type-display-xl text-ink md:type-hero">
          {t('greeting', { greeting, name: firstName })}
        </h1>
        {query.data && total > 0 && (
          <p className="max-w-3xl text-[1.25rem] leading-8 text-ink-muted [font-family:var(--font-display)] md:type-display-md">
            {t('brief', {
              overdue: groups.overdue.length,
              today: groups.today.length,
              upcoming: groups.upcoming.length,
            })}
          </p>
        )}
        {query.data && total > 0 && (
          <nav aria-label={t('jump')} className="flex flex-wrap gap-2">
            {TODAY_GROUPS.map((group) => (
              <a
                key={group}
                href={`#${group}`}
                className="inline-flex items-center gap-2 rounded-full bg-raised px-3.5 py-1.5 type-body-sm text-ink-muted shadow-e1 ring-1 ring-hairline/70 hover:text-ink"
              >
                <span className={cn('font-mono font-medium', ACCENT[group])}>
                  {groups[group].length}
                </span>
                {t(`groups.${group}.title`)}
              </a>
            ))}
          </nav>
        )}
      </header>
      {query.isPending ? (
        <ListSkeleton label={t('loading')} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : total === 0 ? (
        <EmptyState icon={<Coffee />} title={t('clearTitle')} description={t('clearBody')} />
      ) : (
        TODAY_GROUPS.map((group) => (
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
        ))
      )}
    </motion.div>
  );
}
