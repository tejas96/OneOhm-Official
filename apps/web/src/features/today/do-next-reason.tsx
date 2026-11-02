'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { doNextReason } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';

/** Why this task sits where it does on Today, in a few words (spec 3.3). */
export function DoNextReasonLine({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('today.reason');
  const priorityT = useTranslations('projects.priority');
  const format = useFormatter();
  // Work others hold, and work that cannot start yet, have their own line already.
  if (task.status === 'completed' || task.status === 'waiting' || task.status === 'in_review')
    return null;
  if (task.blockedBy.length > 0) return null;
  const reason = doNextReason(task, todayIn());
  let text: string;
  let strong = true;
  switch (reason.kind) {
    case 'priority':
      text = reason.by
        ? t('priorityBy', { level: priorityT(reason.priority), name: reason.by })
        : t('priority', { level: priorityT(reason.priority) });
      break;
    case 'blocksUrgent':
      text = t('blocksUrgent');
      break;
    case 'overdue':
      text = t('overdue', { days: reason.days });
      break;
    case 'blocks':
      text =
        reason.count > 0
          ? t('blocks', { count: reason.count, payment: String(reason.payment) })
          : t('payment');
      break;
    default:
      strong = false;
      text = t('due', {
        date: format.dateTime(new Date(reason.date), { day: 'numeric', month: 'short' }),
      });
  }
  return (
    <p className={cn('type-body-sm', strong ? 'font-medium text-accent' : 'text-ink-faint')}>
      {text}
    </p>
  );
}
