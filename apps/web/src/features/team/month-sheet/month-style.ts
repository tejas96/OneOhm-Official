import type { MonthDayRecord } from '@oneohm/api-contracts';
import type { MonthDayStatus, MonthFlagKind } from '@oneohm/domain';
import {
  Ban,
  BellRing,
  CalendarClock,
  CircleHelp,
  Clock,
  FilePen,
  Hourglass,
  type LucideIcon,
  MapPinOff,
  Route,
  Timer,
} from 'lucide-react';

/**
 * Colours mean the same here as on the live map: green is good, blue is leave, amber is
 * "check this", red is "act now", grey is off duty. Tokens only.
 */
export const DAY_CLASS: Readonly<Record<MonthDayStatus, string>> = {
  present: 'border-transparent bg-on-track-tint text-on-track',
  half_day:
    'border-transparent bg-gradient-to-br from-on-track-tint from-50% to-sunken to-50% text-on-track',
  absent: 'border-transparent bg-overdue-tint text-overdue',
  paid_leave: 'border-transparent bg-waiting-tint text-waiting',
  unpaid_leave: 'border-dashed border-waiting-solid bg-surface text-waiting',
  holiday: 'border-transparent bg-done-tint text-done',
  weekly_off: 'border-transparent bg-sunken text-ink-faint',
  not_joined: 'border-dashed border-hairline bg-transparent text-ink-faint',
  left: 'border-dashed border-hairline bg-transparent text-ink-faint',
  upcoming: 'border-hairline bg-transparent text-ink-faint',
};

/** The solid dot beside each status in the legend. */
export const DAY_DOT: Readonly<Record<MonthDayStatus, string>> = {
  present: 'bg-on-track-solid',
  half_day: 'bg-gradient-to-br from-on-track-solid from-50% to-sunken to-50%',
  absent: 'bg-overdue-solid',
  paid_leave: 'bg-waiting-solid',
  unpaid_leave: 'border border-dashed border-waiting-solid',
  holiday: 'bg-done-solid',
  weekly_off: 'bg-sunken border border-hairline',
  not_joined: 'border border-dashed border-hairline',
  left: 'border border-dashed border-hairline',
  upcoming: 'border border-hairline',
};

export const LEGEND: readonly MonthDayStatus[] = [
  'present',
  'half_day',
  'absent',
  'paid_leave',
  'unpaid_leave',
  'holiday',
  'weekly_off',
  'upcoming',
];

export const FLAG_ICON: Readonly<Record<MonthFlagKind, LucideIcon>> = {
  auto_closed: Timer,
  delayed_tap: Hourglass,
  open_correction: FilePen,
  pending_leave: CalendarClock,
  pending_travel: Route,
  doubtful_visit: MapPinOff,
  open_alert: BellRing,
  absent_no_reason: CircleHelp,
};

/** Alerts and absences with no reason are "act now"; the rest are "check this". */
export const FLAG_TEXT: Readonly<Record<MonthFlagKind, string>> = {
  auto_closed: 'text-at-risk',
  delayed_tap: 'text-at-risk',
  open_correction: 'text-at-risk',
  pending_leave: 'text-at-risk',
  pending_travel: 'text-at-risk',
  doubtful_visit: 'text-at-risk',
  open_alert: 'text-overdue',
  absent_no_reason: 'text-overdue',
};

export type DayMarkKey =
  | 'late'
  | 'autoClosed'
  | 'tapDelayed'
  | 'doubtfulVisit'
  | 'openAlert'
  | 'openCorrection'
  | 'pendingLeave'
  | 'offUnpaid';

const MARKS: readonly { key: DayMarkKey; Icon: LucideIcon; text: string }[] = [
  { key: 'late', Icon: Clock, text: 'text-at-risk' },
  { key: 'autoClosed', Icon: Timer, text: 'text-at-risk' },
  { key: 'tapDelayed', Icon: Hourglass, text: 'text-at-risk' },
  { key: 'doubtfulVisit', Icon: MapPinOff, text: 'text-at-risk' },
  { key: 'openCorrection', Icon: FilePen, text: 'text-at-risk' },
  { key: 'pendingLeave', Icon: CalendarClock, text: 'text-at-risk' },
  { key: 'openAlert', Icon: BellRing, text: 'text-overdue' },
  // A day off not paid: nothing worked or on paid leave that week (policy).
  { key: 'offUnpaid', Icon: Ban, text: 'text-overdue' },
];

/** The small icons a day carries: late, auto-closed, delayed tap, doubtful visit and so on. */
export const marksOf = (day: MonthDayRecord) => MARKS.filter((mark) => day[mark.key]);
