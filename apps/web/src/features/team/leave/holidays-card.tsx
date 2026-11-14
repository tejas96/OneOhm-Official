'use client';

import type { StaffCalendar } from '@oneohm/api-contracts';
import { listItemEnter } from '@oneohm/design-system/web';
import { staffHours } from '@oneohm/domain';
import { daysBetween, todayIn } from '@oneohm/shared';
import { CalendarHeart, Clock } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useWorkforceFormat } from '../workforce-format';

const SHOWN = 5;

/** Working days and hours, and the next holidays (Settings → Working time & holidays). */
export function HolidaysCard({ calendar }: { readonly calendar: StaffCalendar }) {
  const t = useTranslations('team.leave.calendar');
  const format = useWorkforceFormat();
  const today = todayIn();
  const week = staffHours(calendar);
  const ahead = calendar.upcomingHolidays.filter((holiday) => holiday.day >= today);
  const shown = ahead.slice(0, SHOWN);
  const when = (day: string) => {
    const diff = daysBetween(today, day);
    return diff === 0 ? t('today') : diff === 1 ? t('tomorrow') : t('inDays', { count: diff });
  };
  return (
    <section
      aria-label={t('label')}
      className="flex flex-col gap-3 rounded-lg border border-hairline bg-raised p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 type-overline text-ink-faint uppercase">
          <Clock aria-hidden className="size-3.5 text-accent" />
          {t('hours')}
        </p>
        <p className="type-title-md text-ink">{`${week.days} · ${week.hours}`}</p>
        {week.lunch && (
          <p className="type-body-sm text-ink-muted">{t('lunch', { span: week.lunch })}</p>
        )}
      </div>
      <div className="flex flex-col gap-2 border-t border-hairline pt-3">
        <p className="flex items-center gap-1.5 type-overline text-ink-faint uppercase">
          <CalendarHeart aria-hidden className="size-3.5 text-accent" />
          {t('holidays')}
        </p>
        {shown.length === 0 ? (
          <p className="type-body-sm text-ink-muted">{t('none')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {shown.map((holiday, index) => (
              <motion.li
                key={holiday.day}
                {...listItemEnter(index)}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="type-body-sm font-medium text-ink">{holiday.name}</span>
                  <span className="type-label text-ink-faint">{format.day(holiday.day)}</span>
                </span>
                <span className="shrink-0 type-label text-accent">{when(holiday.day)}</span>
              </motion.li>
            ))}
          </ul>
        )}
        {ahead.length > SHOWN && (
          <p className="type-label text-ink-faint">{t('more', { count: ahead.length - SHOWN })}</p>
        )}
        {shown.length > 0 && <p className="type-label text-ink-faint">{t('notCounted')}</p>}
      </div>
    </section>
  );
}
