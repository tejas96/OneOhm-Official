'use client';

import type { MonthDayRecord } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { calendarDate } from '../workforce-format';
import { useMonthFormat } from './month-format';
import { weeksOf, workedText } from './month-math';
import { DAY_CLASS, DAY_DOT, LEGEND, marksOf } from './month-style';

/** Mon–Sun headings in the reader's language; 5 Oct 2026 is a Monday. */
function useWeekdays() {
  const format = useFormatter();
  return Array.from({ length: 7 }, (_, index) =>
    format.dateTime(calendarDate(`2026-10-${String(5 + index).padStart(2, '0')}`), {
      weekday: 'short',
    }),
  );
}

/** One person's month as a calendar: each day coloured by what it counts as, with small marks. */
export function MonthCalendar({
  days,
  selected,
  onSelect,
}: {
  readonly days: readonly MonthDayRecord[];
  readonly selected: string | null;
  readonly onSelect: (date: string) => void;
}) {
  const t = useTranslations('team.monthSheet.calendar');
  const markT = useTranslations('team.monthSheet.marks');
  const weekdays = useWeekdays();
  const words = useMonthFormat();
  return (
    <div className="flex flex-col gap-3">
      <section aria-label={t('label')} className="flex flex-col gap-1">
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((name) => (
            <span key={name} className="pb-1 text-center type-label text-ink-faint">
              {name}
            </span>
          ))}
        </div>
        {weeksOf(days).map((week) => (
          <div key={week.find(Boolean)?.date} className="grid grid-cols-7 gap-1">
            {week.map((day, index) =>
              day ? (
                <button
                  key={day.date}
                  type="button"
                  aria-pressed={selected === day.date}
                  aria-label={[
                    words.longDay(day.date),
                    t(`status.${day.status}`),
                    workedText(day.workedMinutes),
                    ...marksOf(day).map((mark) => markT(mark.key)),
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  onClick={() => onSelect(day.date)}
                  className={cn(
                    'relative flex min-h-14 cursor-pointer flex-col justify-between rounded-lg border p-1.5 text-left sm:min-h-16 sm:p-2',
                    'outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-accent',
                    DAY_CLASS[day.status],
                    selected === day.date && 'ring-2 ring-ink',
                  )}
                >
                  <span className="type-label font-semibold tabular-nums">
                    {Number(day.date.slice(8))}
                  </span>
                  <span className="flex items-end justify-between gap-1">
                    <span className="hidden type-label tabular-nums sm:block">
                      {workedText(day.workedMinutes) ?? ''}
                    </span>
                    <span className="ml-auto flex flex-wrap justify-end gap-0.5">
                      {marksOf(day).map(({ key, Icon, text }) => (
                        <Icon key={key} aria-hidden className={cn('size-3', text)} />
                      ))}
                    </span>
                  </span>
                </button>
              ) : (
                <span key={`blank-${index}`} aria-hidden />
              ),
            )}
          </div>
        ))}
      </section>
      <ul aria-label={t('legend')} className="flex flex-wrap gap-x-4 gap-y-1.5">
        {LEGEND.map((status) => (
          <li key={status} className="flex items-center gap-1.5 type-body-sm text-ink-muted">
            <span aria-hidden className={cn('size-3 rounded-sm', DAY_DOT[status])} />
            {t(`status.${status}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}
