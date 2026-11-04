'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, CardHeader, cn, StatusPill } from '@oneohm/design-system/web';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { hrefWithTask } from '../../task-panel/task-panel-url';
import { PriorityIcon } from '../../tasks/priority-icon';
import { taskStatusKey, taskTone } from '../../tasks/task-status';
import type { ProjectSignals } from '../room-signals';
import { TabLink } from './tab-link';

const SHOWN = 6;

function NextTask({ task, href }: { readonly task: ProjectTask; readonly href: string }) {
  const t = useTranslations('projects.task');
  const partyT = useTranslations('commandCenter.party');
  const stagesT = useTranslations('stages');
  const format = useFormatter();
  return (
    <li className="relative flex items-start gap-4 px-5 py-3 transition-colors hover:bg-sunken/50">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-start gap-1.5">
          <PriorityIcon priority={task.priority} className="mt-0.5" />
          <Link
            href={href}
            scroll={false}
            className="oh-stretched-link type-body-sm font-medium text-ink"
          >
            {task.title}
          </Link>
        </span>
        <p className="flex flex-wrap gap-x-2 type-label text-ink-faint">
          <span>{stagesT(task.stage)}</span>
          <span aria-hidden>·</span>
          {task.assignee ? (
            <span>{task.assignee.fullName}</span>
          ) : (
            <span className="text-at-risk">{t('unassigned')}</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <time
          dateTime={task.dueDate}
          className={cn(
            'font-mono text-[0.75rem] tabular-nums',
            task.overdue ? 'font-medium text-overdue' : 'text-ink-muted',
          )}
        >
          {format.dateTime(new Date(task.dueDate), { day: 'numeric', month: 'short' })}
        </time>
        <StatusPill
          size="sm"
          tone={taskTone(task)}
          label={
            task.status === 'waiting'
              ? t('waitingOn', { party: partyT(task.waitingParty) })
              : t(`status.${taskStatusKey(task)}`)
          }
        />
      </div>
    </li>
  );
}

/** The next few open tasks, soonest due first; each one opens the Tasks tab with that task's panel. */
export function NextUp({
  signals,
  tasksHref,
}: {
  readonly signals: ProjectSignals;
  readonly tasksHref: string;
}) {
  const t = useTranslations('projects.overview.nextUp');
  const next = signals.open.slice(0, SHOWN);
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t('title')}
        description={
          signals.open.length === 0
            ? t('allDone')
            : t('description', { count: signals.open.length })
        }
        action={<TabLink href={tasksHref}>{t('all')}</TabLink>}
      />
      {next.length > 0 && (
        <ol className="flex flex-col divide-y divide-hairline border-t border-hairline">
          {next.map((task) => (
            <NextTask key={task.id} task={task} href={hrefWithTask(tasksHref, task.id)} />
          ))}
        </ol>
      )}
    </Card>
  );
}
