import { addDays, todayIn } from '@oneohm/shared';
import { callDay, WORK_END_MIN } from '../messaging/chat-rules';

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

/** Open visits per slot for one person: one in the morning and one in the afternoon. */
export const VISITS_PER_SLOT = 1;

/** Monday to Saturday are working days; Sunday is closed. */
export function isWorkingDay(day: string): boolean {
  return new Date(`${day}T00:00:00Z`).getUTCDay() !== 0;
}

/** The next working day after `day` (Saturday → Monday). */
export function nextWorkingDay(day: string): string {
  const next = addDays(day, 1);
  return isWorkingDay(next) ? next : addDays(next, 1);
}

/** The working day before `day` (Monday → Saturday). */
export function previousWorkingDay(day: string): string {
  const before = addDays(day, -1);
  return isWorkingDay(before) ? before : addDays(before, -1);
}

/** The slots still free on a day, given the slots already taken that day. */
export function freeSlots(taken: readonly VisitSlot[]): VisitSlot[] {
  return VISIT_SLOTS.filter((slot) => taken.filter((one) => one === slot).length < VISITS_PER_SLOT);
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
  /** Days to look ahead before giving up. */
  readonly horizon?: number;
}): string[] {
  const days: string[] = [];
  const horizon = input.horizon ?? 45;
  for (let step = 1; step <= horizon && days.length < input.count; step += 1) {
    const day = addDays(input.today, step);
    if (!isWorkingDay(day) || input.leave?.has(day)) continue;
    if (freeSlots(input.taken?.[day] ?? []).length === 0) continue;
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
}): boolean {
  if (!input.working || input.today >= input.visitDay) return false;
  const reminderDay = previousWorkingDay(input.visitDay);
  return input.today >= reminderDay && input.confirmedOn < reminderDay;
}

/** The business clock as minutes after midnight. */
function minuteOf(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  return part('hour') * 60 + part('minute');
}

/** A visit not marked done by the end of its day (6:30 pm) is missed. */
export function visitMissed(visitDay: string, now: Date, timeZone: string): boolean {
  const today = todayIn(timeZone, now);
  if (visitDay < today) return true;
  return visitDay === today && minuteOf(now, timeZone) >= WORK_END_MIN;
}

/** Whether the visit day has started (for "not confirmed by the visit morning"). */
export const visitDayStarted = (visitDay: string, now: Date, timeZone: string): boolean =>
  visitDay <= todayIn(timeZone, now);

/** The days the home shows an upcoming visit: today and the next three. */
export const HOME_VISIT_DAYS = 3;

/** The instant a clock time (minutes after midnight) on a calendar day is reached in a time zone. */
export function zonedInstant(day: string, minutes: number, timeZone: string): Date {
  const guess = Date.parse(`${day}T00:00:00Z`) + minutes * 60_000;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(guess));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const local = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
  );
  return new Date(guess - (local - guess));
}

/**
 * When the team promised to confirm a customer's pick ("we'll confirm by 6:30 pm today", or by
 * 12 noon on the next working day), the same promise the customer was told.
 */
export function confirmDeadline(pickedAt: Date, timeZone: string): Date {
  const { add } = callDay(pickedAt, timeZone);
  const day = addDays(todayIn(timeZone, pickedAt), add);
  return zonedInstant(day, add === 0 ? WORK_END_MIN : 12 * 60, timeZone);
}
