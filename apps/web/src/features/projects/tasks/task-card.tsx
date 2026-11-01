'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Avatar, cn, listItemEnter, StatusGlyph, StatusPill } from '@oneohm/design-system/web';
import { CalendarClock, ClipboardList, Eye, Lock, ShieldCheck } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';
import { TaskEvidenceLine } from '@/features/documents/task-evidence-line';
import { useCan } from '@/providers/current-user';
import { useFactLabel } from './fact-fields';
import { TaskActions } from './task-actions';
import { isBlocked, taskGlyph, taskStatusKey, taskTone } from './task-status';

const DISC: Readonly<Record<string, string>> = {
  onTrack: 'bg-on-track-tint text-on-track',
  blocked: 'bg-blocked-tint text-blocked',
  overdue: 'bg-overdue-tint text-overdue',
  review: 'bg-review-tint text-review',
  waiting: 'bg-waiting-tint text-waiting',
  done: 'bg-done-tint text-done',
  neutral: 'bg-sunken text-ink-muted',
};

/** The same person keeps the same swatch everywhere. */
export function swatchFor(name: string): number {
  return [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

/**
 * One task: what it is, who has it, when it is due, what holds it, and the next step.
 * `showProject` adds the project line for lists that mix projects (Today).
 */
export function TaskCard({
  task,
  index = 0,
  showProject = false,
  knownFacts,
}: {
  readonly task: ProjectTask;
  readonly index?: number;
  readonly showProject?: boolean;
  readonly knownFacts?: Readonly<Record<string, string>>;
}) {
  const t = useTranslations('projects.task');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const factLabel = useFactLabel();
  const canOpenProject = useCan('projects.view_all');
  const tone = taskTone(task);
  const done = task.status === 'completed';
  const day = (date: string) => format.dateTime(new Date(date), { day: 'numeric', month: 'short' });

  return (
    <motion.li {...listItemEnter(index)} className="flex gap-4 py-4">
      <span
        className={cn(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full',
          DISC[tone],
        )}
      >
        <StatusGlyph name={taskGlyph(task)} className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {showProject &&
          (canOpenProject ? (
            <Link
              href={`/projects/${task.projectId}`}
              className="self-start font-mono text-[0.75rem] text-ink-faint hover:text-accent"
            >
              {task.projectCode} · {task.projectName}
            </Link>
          ) : (
            <p className="font-mono text-[0.75rem] text-ink-faint">
              {task.projectCode} · {task.projectName}
            </p>
          ))}
        <div className="flex items-start justify-between gap-3">
          <p className={cn('type-title-md', done ? 'text-ink-muted' : 'text-ink')}>{task.title}</p>
          {knownFacts ? (
            <TaskActions task={task} knownFacts={knownFacts} />
          ) : (
            <TaskActions task={task} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 type-body-sm text-ink-muted">
          <StatusPill
            tone={tone}
            label={
              task.status === 'waiting'
                ? t('waitingOn', { party: partyT(task.waitingParty) })
                : t(`status.${taskStatusKey(task)}`)
            }
            size="sm"
          />
          {task.assignee ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                name={task.assignee.fullName}
                swatch={swatchFor(task.assignee.fullName)}
                size="sm"
                className="size-5 text-[0.5625rem]"
              />
              {task.assignee.fullName}
            </span>
          ) : (
            <span className="text-at-risk">{t('unassigned')}</span>
          )}
          <span
            className={cn(
              'inline-flex items-center gap-1.5',
              task.overdue && !done && 'font-medium text-overdue',
            )}
          >
            <CalendarClock aria-hidden className="size-3.5" />
            {done && task.completedAt
              ? t('doneOn', { date: day(task.completedAt) })
              : t(task.overdue ? 'overdueOn' : 'dueOn', { date: day(task.dueDate) })}
          </span>
          {task.approval && !done && (
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck aria-hidden className="size-3.5" />
              {t('needsApproval')}
            </span>
          )}
          {task.customerVisible && (
            <span className="inline-flex items-center gap-1.5">
              <Eye aria-hidden className="size-3.5" />
              {t('customerSees')}
            </span>
          )}
        </div>
        {isBlocked(task) && (
          <p className="flex items-start gap-1.5 type-body-sm text-ink-faint">
            <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t('blockedBy', { tasks: task.blockedBy.join(', ') })}
          </p>
        )}
        {!done && task.captures.length > 0 && (
          <p className="flex items-start gap-1.5 type-body-sm text-ink-faint">
            <ClipboardList aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            {t('records', { facts: task.captures.map(factLabel).join(', ') })}
          </p>
        )}
        <TaskEvidenceLine task={task} />
      </div>
    </motion.li>
  );
}
