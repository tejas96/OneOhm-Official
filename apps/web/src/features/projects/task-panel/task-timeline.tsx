'use client';

import { cn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';

const SHOWN = 10;

/**
 * The project's latest history under the task, newest first, with this task's own
 * lines marked (the same feed the phone app shows).
 */
export function TaskTimeline({ taskId }: { readonly taskId: string }) {
  const t = useTranslations('projects.panel');
  const format = useFormatter();
  const query = useQuery({
    queryKey: ['tasks', 'activity', taskId],
    queryFn: () => expectStatus(api.tasks.taskActivity({ params: { id: taskId } }), 200),
  });

  if (query.isPending) return <p className="type-body-sm text-ink-faint">{t('loading')}</p>;
  if (query.isError) return <p className="type-body-sm text-overdue">{t('timelineError')}</p>;
  const entries = query.data.slice(0, SHOWN);
  if (entries.length === 0)
    return <p className="type-body-sm text-ink-faint">{t('timelineEmpty')}</p>;

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const own = entry.taskId === taskId;
        return (
          <li key={entry.id} className="flex gap-3">
            <span
              aria-hidden
              className={cn('mt-2 size-1.5 shrink-0 rounded-full', own ? 'bg-accent' : 'bg-rule')}
            />
            <div className="flex min-w-0 flex-col">
              <p
                className={cn(
                  'type-body [overflow-wrap:anywhere]',
                  own ? 'text-ink' : 'text-ink-muted',
                )}
              >
                {entry.message}
              </p>
              <p className="type-label text-ink-faint">
                {[entry.user?.fullName, format.relativeTime(new Date(entry.createdAt))]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
