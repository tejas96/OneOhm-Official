'use client';

import { useFormatter } from 'next-intl';
import { calendarDate } from '../workforce-format';

/** Months, days and moments the way the rest of Team writes them, in India time. */
export function useMonthFormat() {
  const format = useFormatter();
  return {
    month: (month: string) =>
      format.dateTime(calendarDate(`${month}-15`), { month: 'long', year: 'numeric' }),
    monthName: (month: string) => format.dateTime(calendarDate(`${month}-15`), { month: 'long' }),
    shortDay: (date: string) =>
      format.dateTime(calendarDate(date), { day: 'numeric', month: 'short' }),
    longDay: (date: string) =>
      format.dateTime(calendarDate(date), { weekday: 'long', day: 'numeric', month: 'long' }),
    time: (instant: string) =>
      format.dateTime(new Date(instant), {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }),
    moment: (instant: string) =>
      format.dateTime(new Date(instant), {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kolkata',
      }),
  };
}
