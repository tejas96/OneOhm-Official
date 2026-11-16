'use client';

import type { MonthDayRecord } from '@oneohm/api-contracts';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMonthFormat } from './month-format';
import { dayHref } from './month-links';
import { workedText } from './month-math';
import { marksOf } from './month-style';

/** What one tapped day is made of: its times, hours and marks, and a way to see the day itself. */
export function DayDetail({
  day,
  userId,
}: {
  readonly day: MonthDayRecord | null;
  readonly userId: string;
}) {
  const t = useTranslations('team.monthSheet.calendar');
  const markT = useTranslations('team.monthSheet.marks');
  const words = useMonthFormat();
  if (!day) return <p className="type-body-sm text-ink-faint">{t('pick')}</p>;
  const hours = workedText(day.workedMinutes);
  const notes = [
    day.holidayName,
    day.leave &&
      `${day.leave.label}${day.leave.half ? ` (${t('half')})` : ''}${day.leave.paid ? '' : ` — ${t('unpaid')}`}`,
    day.workedOnDayOff ? t('workedOnDayOff') : null,
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1.5 rounded-lg bg-sunken px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <p className="type-body font-medium text-ink">
          {words.longDay(day.date)} — {t(`status.${day.status}`)}
        </p>
        <Link
          href={dayHref(userId, day.date)}
          className="inline-flex shrink-0 items-center gap-1 type-body-sm text-accent hover:underline"
        >
          {t('openDay')}
          <ArrowUpRight aria-hidden className="size-3.5" />
        </Link>
      </div>
      {day.checkInAt ? (
        <p className="type-body-sm text-ink-muted tabular-nums">
          {t('times', {
            from: words.time(day.checkInAt),
            to: day.checkOutAt ? words.time(day.checkOutAt) : t('stillIn'),
          })}
          {hours && ` · ${hours}`}
        </p>
      ) : (
        <p className="type-body-sm text-ink-faint">{t('noCheckIn')}</p>
      )}
      {notes.length > 0 && <p className="type-body-sm text-ink-muted">{notes.join(' · ')}</p>}
      {marksOf(day).length > 0 && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {marksOf(day).map(({ key, Icon, text }) => (
            <li key={key} className={`inline-flex items-center gap-1 type-body-sm ${text}`}>
              <Icon aria-hidden className="size-3.5" />
              {markT(key)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
