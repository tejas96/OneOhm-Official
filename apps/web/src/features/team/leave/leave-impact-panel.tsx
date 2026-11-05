'use client';

import type { LeaveImpact } from '@oneohm/api-contracts';
import { Badge, Skeleton } from '@oneohm/design-system/web';
import { CalendarSearch, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FormError } from '@/components/form-error';
import { describeError } from '@/lib/api/api-error';
import { daysOf, useWorkforceFormat } from '../workforce-format';
import { LeaveClashNotes } from './leave-clash-notes';

/** Days counted, the balance left after, overlaps, and the work the leave touches. */
export function LeaveImpactPanel({
  impact,
  loading,
  error,
  kindLabel,
}: {
  readonly impact: LeaveImpact | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  readonly kindLabel: string;
}) {
  const t = useTranslations('team.leave.impact');
  const format = useWorkforceFormat();

  if (error) return <FormError message={describeError(error)} />;
  if (!impact && loading) return <Skeleton className="h-28 w-full rounded-lg" />;
  if (!impact)
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed border-rule p-4 type-body-sm text-ink-faint">
        <CalendarSearch aria-hidden className="mt-0.5 size-4 shrink-0" />
        {t('pickDays')}
      </p>
    );

  const short = impact.balanceAfterHalfDays < 0;
  return (
    <section
      aria-label={t('label')}
      aria-busy={loading}
      className="flex flex-col gap-4 rounded-lg border border-hairline bg-raised p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="type-display-md text-ink tabular-nums">
          {impact.halfDays === 0
            ? t('noWorkingDays')
            : t('days', { count: daysOf(impact.halfDays) })}
        </p>
        <p className={short ? 'type-body-sm text-at-risk' : 'type-body-sm text-ink-muted'}>
          {short
            ? t('over', { count: daysOf(-impact.balanceAfterHalfDays), kind: kindLabel })
            : t('left', { count: daysOf(impact.balanceAfterHalfDays), kind: kindLabel })}
        </p>
      </div>
      {impact.overlapsExisting && (
        <p className="flex items-start gap-2 rounded-md bg-at-risk-tint px-3 py-2.5 type-body-sm text-ink">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-at-risk" />
          {t('overlap')}
        </p>
      )}
      <LeaveClashNotes clashes={impact.clashes} />
      {impact.tasks.length === 0 ? (
        <p className="type-body-sm text-ink-muted">{t('noTasks')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="type-title-md text-ink">{t('tasks', { count: impact.tasks.length })}</h3>
          <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline">
            {impact.tasks.map((task) => (
              <li key={task.id} className="flex flex-col gap-0.5 px-3 py-2.5">
                <p className="type-body-sm font-medium text-ink">{task.title}</p>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-body-sm text-ink-faint">
                  <span className="font-mono text-[0.75rem]">{task.projectCode}</span>
                  <span>{t('due', { day: format.day(task.dueDate) })}</span>
                  {task.customerVisible && <Badge variant="soft">{t('customerSees')}</Badge>}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
