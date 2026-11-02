'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { todayIn } from '@oneohm/shared';
import { Hourglass } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { staleLabelDays } from './stale-days';

/** "No update for n days" on work that has gone quiet (spec 3.5); nothing otherwise. */
export function StaleBadge({
  task,
  className,
}: {
  readonly task: ProjectTask;
  readonly className?: string;
}) {
  const t = useTranslations('projects.task');
  // An older API sends no `stale` yet; read that as fresh.
  if (task.stale !== true) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium text-at-risk', className)}>
      <Hourglass aria-hidden className="size-3.5" />
      {t('stale', {
        // The server's count leaves out leave days; an older API only sends the date.
        days: task.idleDays ?? staleLabelDays(task.lastUpdateAt, todayIn()),
      })}
    </span>
  );
}
