import { ROUTE_GAP_MINUTES } from './route-km';

/**
 * The alerts of a duty day ("Nothing goes silent", Duty Day step 5). Each kind fires once per
 * subject and day; these pure rules say when. The server raises them on point upload, on
 * visit events and every five minutes.
 */
export const DUTY_ALERT_KINDS = [
  'not_checked_in',
  'fake_gps',
  'route_gap',
  'unknown_stop',
  'visit_open_long',
  'visit_missed',
  'visit_doubtful',
  'job_left_unfinished',
  'claim_waiting',
  'claim_unpaid',
] as const;
export type DutyAlertKind = (typeof DUTY_ALERT_KINDS)[number];

/** Amber = check this, red = act now (the colours of every Duty Day screen). */
export const DUTY_ALERT_SEVERITIES = ['amber', 'red'] as const;
export type DutyAlertSeverity = (typeof DUTY_ALERT_SEVERITIES)[number];

/**
 * What an alert is about: the person's day (`person`, id = the person), a site visit, the
 * work at a site (`task` or `service_request`, the live map's site id) or a travel claim.
 */
export const DUTY_ALERT_SUBJECTS = [
  'person',
  'site_visit',
  'task',
  'service_request',
  'travel_claim',
] as const;
export type DutyAlertSubject = (typeof DUTY_ALERT_SUBJECTS)[number];

/** Each kind's colour when raised; a route gap turns red when long (`routeGapSeverity`). */
export const DUTY_ALERT_SEVERITY: Readonly<Record<DutyAlertKind, DutyAlertSeverity>> = {
  not_checked_in: 'amber',
  fake_gps: 'red',
  route_gap: 'amber',
  unknown_stop: 'amber',
  visit_open_long: 'amber',
  visit_missed: 'red',
  visit_doubtful: 'amber',
  job_left_unfinished: 'amber',
  claim_waiting: 'amber',
  claim_unpaid: 'amber',
};

/** Not checked in this long after the day start is an alert, in minutes. */
export const NOT_CHECKED_IN_AFTER_MINUTES = 30;
/** A route gap longer than this is red, in minutes (over `ROUTE_GAP_MINUTES` it is amber). */
export const ROUTE_GAP_RED_MINUTES = 60;
/** A site visit open longer than this is an alert, in minutes. */
export const VISIT_OPEN_LONG_MINUTES = 4 * 60;
/** A planned visit nobody reached this long after its start is missed, in minutes. */
export const VISIT_MISSED_AFTER_MINUTES = 30;
/** A travel claim waiting longer than this is an alert, in days. */
export const CLAIM_WAITING_DAYS = 2;
/** An approved travel claim not paid after this long is an alert, in days. */
export const CLAIM_UNPAID_DAYS = 7;

const DAY_MS = 86_400_000;

/**
 * A working day (no weekly off, no holiday), the person not on leave, no check-in, and the
 * day start plus 30 minutes passed (minutes after midnight, business time).
 */
export function missedCheckIn(input: {
  readonly workingDay: boolean;
  readonly onLeave: boolean;
  readonly checkedIn: boolean;
  readonly dayStartMin: number;
  readonly nowMin: number;
}): boolean {
  if (!input.workingDay || input.onLeave || input.checkedIn) return false;
  return input.nowMin >= input.dayStartMin + NOT_CHECKED_IN_AFTER_MINUTES;
}

/**
 * How long the phone has been silent on duty: from the last kept point, or from the check-in
 * when there is none yet, to now. In whole minutes.
 */
export function silentMinutes(input: {
  readonly dutyStartedAt: Date;
  readonly lastPointAt: Date | null;
  readonly now: Date;
}): number {
  const heard = Math.max(input.dutyStartedAt.getTime(), input.lastPointAt?.getTime() ?? 0);
  return Math.max(0, Math.floor((input.now.getTime() - heard) / 60_000));
}

/** No alert up to 20 minutes, amber over it, red over 60. */
export function routeGapSeverity(minutes: number): DutyAlertSeverity | null {
  if (minutes <= ROUTE_GAP_MINUTES) return null;
  return minutes > ROUTE_GAP_RED_MINUTES ? 'red' : 'amber';
}

/** A site visit open over 4 hours. */
export const visitOpenTooLong = (checkInAt: Date, now: Date): boolean =>
  now.getTime() - checkInAt.getTime() > VISIT_OPEN_LONG_MINUTES * 60_000;

/** A planned start (minutes after midnight) passed by 30 minutes and nobody checked in. */
export function plannedVisitMissed(input: {
  readonly plannedStartMin: number | null;
  readonly nowMin: number;
  readonly arrived: boolean;
}): boolean {
  if (input.arrived || input.plannedStartMin === null) return false;
  return input.nowMin >= input.plannedStartMin + VISIT_MISSED_AFTER_MINUTES;
}

/** A claim still waiting more than 2 days after it was made. */
export const claimWaitingTooLong = (madeAt: Date, now: Date): boolean =>
  now.getTime() - madeAt.getTime() > CLAIM_WAITING_DAYS * DAY_MS;

/** An approved claim still unpaid more than 7 days after it was approved. */
export const claimUnpaidTooLong = (approvedAt: Date, now: Date): boolean =>
  now.getTime() - approvedAt.getTime() > CLAIM_UNPAID_DAYS * DAY_MS;

/**
 * The likely reason a phone went quiet, from the last reading before the silence: a low
 * battery (15% or less, not charging), no network, location switched off or consent
 * withdrawn (`locationOn` false), else unknown (the app was probably stopped by the phone).
 */
export const GAP_REASONS = ['low_battery', 'no_network', 'location_off', 'unknown'] as const;
export type GapReason = (typeof GAP_REASONS)[number];

/** A battery at or under this, not charging, is low, in percent. */
export const LOW_BATTERY_PERCENT = 15;

export function gapReason(
  last: {
    readonly batteryPercent: number | null;
    readonly charging: boolean | null;
    readonly network: string | null;
  } | null,
  locationOn: boolean,
): GapReason {
  if (!locationOn) return 'location_off';
  if (!last) return 'unknown';
  if (last.batteryPercent !== null && last.batteryPercent <= LOW_BATTERY_PERCENT && !last.charging)
    return 'low_battery';
  if (last.network === 'none') return 'no_network';
  return 'unknown';
}

/**
 * Whether location was being read when a silence began: not when consent was (re)given only
 * after it began (it had been withdrawn, or given for old words), else as tracking is now.
 */
export function locationOnAt(
  silenceStart: Date,
  tracking: { readonly on: boolean; readonly consentedAt: Date | null },
): boolean {
  if (!tracking.on) return false;
  return !tracking.consentedAt || tracking.consentedAt.getTime() <= silenceStart.getTime();
}
