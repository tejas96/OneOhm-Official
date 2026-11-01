'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Card, CardHeader, cn } from '@oneohm/design-system/web';
import { CircleAlert, FileCog, Hourglass, type LucideIcon, UserRoundX } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { changeRequestsHolding, type ProjectSignals } from '../room-signals';

const MAX_TASKS = 3;

function Risk({
  icon: Icon,
  tone,
  title,
  children,
}: {
  readonly icon: LucideIcon;
  readonly tone: 'overdue' | 'blocked' | 'waiting' | 'atRisk';
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-2.5 rounded-md border p-3',
        tone === 'overdue' && 'border-overdue-solid/25 bg-overdue-tint/40',
        tone === 'blocked' && 'border-blocked-solid/25 bg-blocked-tint/40',
        tone === 'waiting' && 'border-waiting-solid/25 bg-waiting-tint/40',
        tone === 'atRisk' && 'border-at-risk-solid/25 bg-at-risk-tint/40',
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          tone === 'overdue' && 'text-overdue',
          tone === 'blocked' && 'text-blocked',
          tone === 'waiting' && 'text-waiting',
          tone === 'atRisk' && 'text-at-risk',
        )}
      />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="type-body-sm font-medium text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** A few task titles under a risk, then how many more. */
function TaskNames({ tasks }: { readonly tasks: readonly ProjectTask[] }) {
  const t = useTranslations('projects.overview.risks');
  return (
    <ul className="flex flex-col gap-0.5 type-body-sm text-ink-muted">
      {tasks.slice(0, MAX_TASKS).map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
      {tasks.length > MAX_TASKS && (
        <li className="text-ink-faint">{t('more', { count: tasks.length - MAX_TASKS })}</li>
      )}
    </ul>
  );
}

/**
 * What could slip and why: late work, change requests holding tasks, work sitting with
 * the customer, bank or DISCOM, and ready work nobody has picked up.
 */
export function RisksPanel({ signals }: { readonly signals: ProjectSignals }) {
  const t = useTranslations('projects.overview.risks');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const day = (date: string) => format.dateTime(new Date(date), { day: 'numeric', month: 'short' });
  const holding = changeRequestsHolding(signals.heldByChange);
  const quiet =
    signals.overdue.length === 0 &&
    holding.length === 0 &&
    signals.waitingOnOthers.length === 0 &&
    signals.needsOwner.length === 0;

  return (
    <Card>
      <CardHeader title={t('title')} description={quiet ? t('none') : undefined} />
      {!quiet && (
        <ul className="flex flex-col gap-2.5 px-5 pb-5">
          {signals.overdue.length > 0 && (
            <Risk
              icon={CircleAlert}
              tone="overdue"
              title={t('overdue', { count: signals.overdue.length })}
            >
              <ul className="flex flex-col gap-0.5 type-body-sm text-ink-muted">
                {signals.overdue.slice(0, MAX_TASKS).map((task) => (
                  <li key={task.id}>
                    {t('overdueTask', { task: task.title, date: day(task.dueDate) })}
                  </li>
                ))}
              </ul>
            </Risk>
          )}
          {holding.map((request) => (
            <Risk
              key={request.name}
              icon={FileCog}
              tone="blocked"
              title={t('heldByChange', { request: request.name, count: request.tasks })}
            >
              <TaskNames
                tasks={signals.heldByChange
                  .filter((held) => held.requests.includes(request.name))
                  .map((held) => held.task)}
              />
            </Risk>
          ))}
          {signals.waitingOnOthers.map((task) => (
            <Risk
              key={task.id}
              icon={Hourglass}
              tone="waiting"
              title={t('waiting', { party: partyT(task.waitingParty) })}
            >
              <p className="type-body-sm text-ink-muted">{task.title}</p>
            </Risk>
          ))}
          {signals.needsOwner.length > 0 && (
            <Risk
              icon={UserRoundX}
              tone="atRisk"
              title={t('needsOwner', { count: signals.needsOwner.length })}
            >
              <TaskNames tasks={signals.needsOwner} />
            </Risk>
          )}
        </ul>
      )}
    </Card>
  );
}
