import { BUSINESS_TIME_ZONE } from '@/lib/dates';

const day = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  timeZone: BUSINESS_TIME_ZONE,
});

/** "12 Oct" in India time for an instant. */
export const dayOf = (instant: string) => day.format(new Date(instant));
