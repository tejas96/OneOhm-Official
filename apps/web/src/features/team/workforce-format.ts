'use client';

import type { PillTone } from '@oneohm/design-system/web';
import { useFormatter } from 'next-intl';

type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/** A calendar date ("2026-11-02") at midday, so no time zone can move it to another day. */
export const calendarDate = (date: string) => new Date(`${date}T12:00:00`);

/** Leave is counted in half days: 24 → 12, 5 → 2.5. */
export const daysOf = (halfDays: number) => halfDays / 2;

export const DECISION_TONE: Readonly<Record<DecisionStatus, PillTone>> = {
  pending: 'review',
  approved: 'onTrack',
  rejected: 'overdue',
  cancelled: 'neutral',
};

/** Times, days and ranges in the reader's locale and India time. */
export function useWorkforceFormat() {
  const format = useFormatter();
  const day = (date: string) =>
    format.dateTime(calendarDate(date), { weekday: 'short', day: 'numeric', month: 'short' });
  return {
    time: (instant: string) =>
      format.dateTime(new Date(instant), { hour: 'numeric', minute: '2-digit' }),
    day,
    longDay: (date: string) =>
      format.dateTime(calendarDate(date), {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    range: (from: string, to: string) =>
      from === to
        ? day(from)
        : format.dateTimeRange(calendarDate(from), calendarDate(to), {
            day: 'numeric',
            month: 'short',
          }),
    ago: (instant: string) => format.relativeTime(new Date(instant), new Date()),
  };
}
