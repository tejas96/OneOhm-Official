import type { MonthDayRecord } from '@oneohm/api-contracts';
import type { Tone } from '@oneohm/mobile-ui';
import { MONTH } from '@/copy/month';

type Status = MonthDayRecord['status'];

/** Green good, blue moving (leave), amber check, red act now, grey off duty. */
const TONES: Readonly<Record<Status, Tone | null>> = {
  present: 'onTrack',
  half_day: 'atRisk',
  absent: 'overdue',
  paid_leave: 'waiting',
  unpaid_leave: 'review',
  holiday: 'done',
  weekly_off: 'neutral',
  not_joined: null,
  left: null,
  upcoming: null,
};

/** The colour a day is drawn in; null for days that do not count (drawn empty). */
export const toneOf = (status: Status): Tone | null => TONES[status];

export const statusLabel = (status: Status): string => MONTH.status[status];

/** The order the legend lists statuses in. */
export const LEGEND_ORDER: readonly Status[] = [
  'present',
  'half_day',
  'absent',
  'paid_leave',
  'unpaid_leave',
  'holiday',
  'weekly_off',
];

export type MarkKey = 'late' | 'autoClosed' | 'doubtful' | 'offUnpaid';

/** The small marks a day carries. */
export function marksOf(day: MonthDayRecord): MarkKey[] {
  const marks: MarkKey[] = [];
  if (day.late) marks.push('late');
  if (day.autoClosed) marks.push('autoClosed');
  if (day.doubtfulVisit) marks.push('doubtful');
  // A holiday or weekly off not paid: nothing worked or on paid leave that week.
  if (day.offUnpaid) marks.push('offUnpaid');
  return marks;
}
