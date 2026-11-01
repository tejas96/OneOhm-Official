'use client';

import { useFormatter, useTranslations } from 'next-intl';

/** Distances, time on site and clock times the way site activity reads everywhere. */
export function useSiteFormat() {
  const t = useTranslations('siteActivity');
  const format = useFormatter();
  const distance = (metres: number) =>
    metres < 1000
      ? t('distance.metres', { value: metres })
      : t('distance.kilometres', {
          value: format.number(metres / 1000, { maximumFractionDigits: 1 }),
        });
  const duration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return t('duration.minutes', { minutes: rest });
    return rest === 0
      ? t('duration.hours', { hours })
      : t('duration.hoursMinutes', { hours, minutes: rest });
  };
  const time = (instant: string) =>
    format.dateTime(new Date(instant), { hour: 'numeric', minute: '2-digit' });
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00`), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  return { distance, duration, time, day };
}
