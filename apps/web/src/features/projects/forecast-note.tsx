'use client';

import type { ProjectSummary } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { CalendarClock } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

/**
 * The expected finish in one line, with the rule behind it on hover: the last open
 * task's due date moved on by how late the work runs today (PRD 3.1).
 */
export function ForecastNote({
  forecast,
  className,
}: {
  readonly forecast: ProjectSummary['forecast'];
  readonly className?: string;
}) {
  const t = useTranslations('projects.forecast');
  const format = useFormatter();
  if (!forecast.expectedFinish) return null;
  const date = format.dateTime(new Date(`${forecast.expectedFinish}T12:00:00`), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const behind = forecast.slipDays > 0;
  return (
    <p
      title={t('rule')}
      className={cn(
        'inline-flex items-center gap-1.5 type-body-sm',
        behind ? 'text-at-risk' : 'text-ink-muted',
        className,
      )}
    >
      <CalendarClock aria-hidden className="size-3.5 shrink-0" />
      {behind ? t('behind', { date, days: forecast.slipDays }) : t('onPlan', { date })}
    </p>
  );
}

/** The expected finish as a short second line in a table cell: "Finish 9 Dec · 4 days behind". */
export function ForecastShort({ forecast }: { readonly forecast: ProjectSummary['forecast'] }) {
  const t = useTranslations('projects.forecast');
  const format = useFormatter();
  if (!forecast.expectedFinish) return null;
  const date = format.dateTime(new Date(`${forecast.expectedFinish}T12:00:00`), {
    day: 'numeric',
    month: 'short',
  });
  return (
    <span
      title={t('rule')}
      className={cn('type-label', forecast.slipDays > 0 ? 'text-at-risk' : 'text-ink-faint')}
    >
      {forecast.slipDays > 0
        ? t('shortBehind', { date, days: forecast.slipDays })
        : t('short', { date })}
    </span>
  );
}
