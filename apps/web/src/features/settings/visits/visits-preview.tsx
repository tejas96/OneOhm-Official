'use client';

import type { VisitSettingsRecord, WorkingTimeRecord } from '@oneohm/api-contracts';
import { calendarOf, clockShort } from '@oneohm/domain';
import { addDays, todayIn } from '@oneohm/shared';
import { useFormatter, useTranslations } from 'next-intl';
import { dayPieces, firstBookable } from '../working-time/working-time-text';

/** What the numbers add up to: a sample working day, and when customers can book. */
export function VisitsPreview({
  visits,
  work,
}: {
  readonly visits: VisitSettingsRecord;
  readonly work: WorkingTimeRecord;
}) {
  const t = useTranslations('settings.visits.preview');
  const format = useFormatter();
  const today = todayIn();
  const cal = calendarOf(
    work,
    'Asia/Kolkata',
    work.holidays.map((holiday) => holiday.day),
  );
  const sample = Array.from({ length: 14 }, (_, step) => addDays(today, step)).find(
    (day) => dayPieces(cal, visits, day).length > 0,
  );
  const pieces = sample ? dayPieces(cal, visits, sample) : [];
  const first = firstBookable(cal, visits, new Date(), today);
  const dayWord = (day: string) =>
    day === today
      ? t('today')
      : day === addDays(today, 1)
        ? t('tomorrow')
        : format.dateTime(new Date(`${day}T00:00:00`), {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-sunken px-5 py-4" aria-live="polite">
      <p className="type-label text-ink-muted">{t('title')}</p>
      <p className="type-body text-ink">
        {t('day')}{' '}
        {pieces.length > 0
          ? pieces.map((piece) => (piece.kind === 'lunch' ? t('lunch') : piece.text)).join(' · ')
          : t('noSlots')}
      </p>
      <p className="type-body-sm text-ink-muted">
        {first
          ? t('window', {
              from: `${dayWord(first.day)}, ${clockShort(first.startMin)}`,
              ahead: visits.daysAhead,
              shown: visits.daysShown,
            })
          : t('windowNone', { ahead: visits.daysAhead, shown: visits.daysShown })}
      </p>
    </div>
  );
}
