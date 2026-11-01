'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { changeRequestsHolding, type ProjectSignals } from './room-signals';

interface Reason {
  readonly key: string;
  readonly critical: boolean;
  readonly message: string;
}

/**
 * What threatens the dates, in one calm banner under the stage bar: overdue work,
 * change requests holding tasks, time spent waiting on others and work about to slip.
 * Nothing to say, no banner.
 */
export function RoomAlerts({
  project,
  signals,
}: {
  readonly project: ProjectDetail;
  readonly signals: ProjectSignals;
}) {
  const t = useTranslations('projects.room.alerts');
  const partyT = useTranslations('commandCenter.party');
  const format = useFormatter();
  const reasons: Reason[] = [];
  if (signals.overdue.length > 0)
    reasons.push({
      key: 'overdue',
      critical: true,
      message: t('overdue', { count: signals.overdue.length }),
    });
  for (const request of changeRequestsHolding(signals.heldByChange))
    reasons.push({
      key: `change-${request.name}`,
      critical: false,
      message: t('heldByChange', { request: request.name, count: request.tasks }),
    });
  if (project.waitingOn && project.waitingOn !== 'internal')
    reasons.push({
      key: 'waiting',
      critical: false,
      message: t('waiting', { party: partyT(project.waitingOn), days: project.waitingDays }),
    });
  const [soon] = signals.dueSoon;
  if (soon && project.status === 'active')
    reasons.push({
      key: 'soon',
      critical: false,
      message:
        signals.dueSoon.length === 1
          ? t('dueSoonOne', {
              task: soon.title,
              date: format.dateTime(new Date(soon.dueDate), { day: 'numeric', month: 'short' }),
            })
          : t('dueSoonMany', { count: signals.dueSoon.length }),
    });
  if (reasons.length === 0) return null;
  const critical = reasons.some((reason) => reason.critical);

  return (
    <ul
      aria-label={t('label')}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border p-4',
        critical
          ? 'border-overdue-solid/30 bg-overdue-tint/50'
          : 'border-at-risk-solid/30 bg-at-risk-tint/50',
      )}
    >
      {reasons.map((reason) => (
        <li key={reason.key} className="flex items-start gap-2 type-body-sm text-ink">
          {reason.critical ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-overdue" />
          ) : (
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          )}
          <span>
            <span className="sr-only">{t(reason.critical ? 'critical' : 'risk')}</span>
            {reason.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
