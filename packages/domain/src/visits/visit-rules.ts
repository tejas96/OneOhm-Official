import { addDays, todayIn } from '@oneohm/shared';
import {
  type BusinessCalendar,
  clockAt,
  DEFAULT_CALENDAR,
  isWorkingDay,
  previousWorkingDay,
  zonedInstant,
} from '../calendar/business-calendar';
import { confirmByMin } from '../calendar/hours-text';
import { callDay } from '../messaging/chat-rules';

/** The visits the team books with a customer (redesign §8). */
export const VISIT_KINDS = [
  'survey',
  'installation',
  'inspection',
  'net_meter',
  'amc',
  'service',
] as const;
export type VisitKind = (typeof VISIT_KINDS)[number];

/** proposed (the customer picked) → confirmed (the team agreed) → done; or cancelled / missed. */
export const VISIT_STATUSES = ['proposed', 'confirmed', 'done', 'cancelled', 'missed'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** A visit is open while it still has to happen. */
export const OPEN_VISIT_STATUSES = ['proposed', 'confirmed'] as const;

export const VISIT_SLOTS = ['morning', 'afternoon'] as const;
export type VisitSlot = (typeof VISIT_SLOTS)[number];

/** The DISCOM chooses these days: the customer is told, not asked (redesign §4, §18 action 12). */
export const isPresenceKind = (kind: VisitKind): boolean =>
  kind === 'inspection' || kind === 'net_meter';

/** What a task template makes of a visit; null for work that is done in the office. */
const TASK_VISIT: Readonly<Record<string, VisitKind>> = {
  site_survey: 'survey',
  site_survey_society: 'survey',
  site_survey_commercial: 'survey',
  site_survey_ground: 'survey',
  structure_installation: 'installation',
  panel_installation: 'installation',
  inverter_installation: 'installation',
  battery_installation: 'installation',
  discom_inspection: 'inspection',
  net_meter_installation: 'net_meter',
};

export const visitKindOfTask = (templateKey: string): VisitKind | null =>
  TASK_VISIT[templateKey] ?? null;

/** Open visits one person holds per slot unless Settings → Visits & bookings says otherwise. */
export const VISITS_PER_SLOT = 1;

/** The slots still free on a day, given the slots already taken that day. */
export function freeSlots(
  taken: readonly VisitSlot[],
  perSlot: number = VISITS_PER_SLOT,
): VisitSlot[] {
  return VISIT_SLOTS.filter((slot) => taken.filter((one) => one === slot).length < perSlot);
}

/**
 * The next working days the crew is free, starting tomorrow: not Sunday, not on leave, and at
 * least one slot not taken. `taken` lists the slots already booked per day; `leave` the days away.
 * With no crew yet the days are simply the next working days.
 */
export function freeVisitDays(input: {
  readonly today: string;
  readonly count: number;
  readonly leave?: ReadonlySet<string>;
  readonly taken?: Readonly<Record<string, readonly VisitSlot[]>>;
  /** Days to look ahead before giving up (Settings: how far ahead). */
  readonly horizon?: number;
  /** Open visits one person can hold in a slot (Settings). */
  readonly perSlot?: number;
  readonly calendar?: BusinessCalendar;
}): string[] {
  const days: string[] = [];
  const horizon = input.horizon ?? 45;
  const cal = input.calendar ?? DEFAULT_CALENDAR;
  for (let step = 1; step <= horizon && days.length < input.count; step += 1) {
    const day = addDays(input.today, step);
    if (!isWorkingDay(day, cal) || input.leave?.has(day)) continue;
    if (freeSlots(input.taken?.[day] ?? [], input.perSlot).length === 0) continue;
    days.push(day);
  }
  return days;
}

/**
 * The day-before reminder is due on the working day before the visit (Saturday for a Monday
 * visit), in working hours, and only when the booking is older than that day: a visit booked
 * the day before already told the customer "tomorrow".
 */
export function reminderDue(input: {
  readonly visitDay: string;
  readonly confirmedOn: string;
  readonly today: string;
  readonly working: boolean;
  readonly calendar?: BusinessCalendar;
}): boolean {
  if (!input.working || input.today >= input.visitDay) return false;
  const reminderDay = previousWorkingDay(input.visitDay, input.calendar);
  return input.today >= reminderDay && input.confirmedOn < reminderDay;
}

/**
 * A visit not marked done by the end of its day (closing time) is missed. With the visit's own
 * end and a grace (Settings → missed after), it is missed that many minutes after the visit ends.
 */
export function visitMissed(
  visitDay: string,
  now: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
  after?: { readonly endMin: number; readonly minutes: number },
): boolean {
  const today = todayIn(cal.timeZone, now);
  if (visitDay < today) return true;
  if (visitDay > today) return false;
  const at = after ? after.endMin + after.minutes : cal.endMin;
  return clockAt(now, cal.timeZone).minute >= at;
}

/** Whether the visit day has started (for "not confirmed by the visit morning"). */
export const visitDayStarted = (
  visitDay: string,
  now: Date,
  cal: BusinessCalendar = DEFAULT_CALENDAR,
): boolean => visitDay <= todayIn(cal.timeZone, now);

/** The days the home shows an upcoming visit: today and the next three. */
export const HOME_VISIT_DAYS = 3;

/**
 * When the team promised to confirm a customer's pick ("we'll confirm by closing time today",
 * or by `confirmByMin` (12 noon at the usual hours) on the next working day), the same promise
 * the customer was told.
 */
export function confirmDeadline(pickedAt: Date, cal: BusinessCalendar = DEFAULT_CALENDAR): Date {
  const { add } = callDay(pickedAt, cal);
  const day = addDays(todayIn(cal.timeZone, pickedAt), add);
  return zonedInstant(day, add === 0 ? cal.endMin : confirmByMin(cal), cal.timeZone);
}
