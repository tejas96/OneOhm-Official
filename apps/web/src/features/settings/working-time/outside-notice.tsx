'use client';

import type { WorkingTimeSaved } from '@oneohm/api-contracts';
import { IconButton } from '@oneohm/design-system/web';
import { rangeText } from '@oneohm/domain';
import { TriangleAlert, X } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

type Outside = WorkingTimeSaved['outside'];

/** After a save: booked visits the new hours leave outside working time (kept, not moved). */
export function OutsideNotice({
  outside,
  onDismiss,
}: {
  readonly outside: Outside;
  readonly onDismiss: () => void;
}) {
  const t = useTranslations('settings.workingTime.outside');
  const format = useFormatter();
  if (outside.count === 0) return null;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-lg bg-sunken px-4 py-3.5">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-overdue" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="type-body font-medium text-ink">{t('title', { count: outside.count })}</p>
          <p className="type-body-sm text-ink-muted">{t('hint')}</p>
        </div>
        <IconButton label={t('dismiss')} onClick={onDismiss}>
          <X />
        </IconButton>
      </div>
      <ul className="flex flex-col divide-y divide-hairline rounded-md border border-hairline bg-raised">
        {outside.visits.map((visit) => (
          <li key={visit.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-4 py-2">
            <span className="min-w-0 flex-1 truncate type-body">{visit.title}</span>
            <span className="type-body-sm text-ink-muted">
              {format.dateTime(new Date(`${visit.day}T00:00:00`), {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              })}
              {' · '}
              {visit.startMin !== null && visit.endMin !== null
                ? rangeText(visit.startMin, visit.endMin)
                : t('noTime')}
            </span>
          </li>
        ))}
      </ul>
      {outside.count > outside.visits.length && (
        <p className="type-body-sm text-ink-faint">
          {t('more', { count: outside.count - outside.visits.length })}
        </p>
      )}
    </div>
  );
}
