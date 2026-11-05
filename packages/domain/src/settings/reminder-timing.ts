import { addDays, daysBetween } from '@oneohm/shared';
import { checkSurveyCredit } from '../survey/self-survey';
import { checkTime, checkWhole, type SettingErrors } from './settings-check';

/** When reminders and summaries go out (PRD 7.1, 7.2). Owners change them in Settings. */
export interface ReminderTiming {
  /** Days after a customer payment falls due before the first reminder. */
  readonly paymentGraceDays: number;
  /** Days between reminders while it stays unpaid. */
  readonly paymentRepeatDays: number;
  /** "HH:MM" business time: each person's list of today's work. */
  readonly staffDigestTime: string;
  /** "HH:MM" business time: the owner's summary of yesterday. */
  readonly ownerSummaryTime: string;
  /** Days before a lead's follow-up date that its owner is reminded (0 = on the day). */
  readonly followUpLeadDays: number;
  /** Days after a customer says the subsidy has not reached their bank before the owner is told. */
  readonly subsidyChaseDays: number;
  /** The self-survey offer (redesign §7): offered to customers with a project, on or off. */
  readonly selfSurveyOffer: boolean;
  /** Paise taken off the next payment when the engineer approves a self survey. */
  readonly selfSurveyPaise: number;
  /** Outside working hours, one calm WhatsApp reply tells the customer who has their message. */
  readonly whatsappNightReply: boolean;
}

export const DEFAULT_REMINDER_TIMING: ReminderTiming = {
  paymentGraceDays: 3,
  paymentRepeatDays: 7,
  staffDigestTime: '08:30',
  ownerSummaryTime: '08:45',
  followUpLeadDays: 1,
  subsidyChaseDays: 15,
  selfSurveyOffer: true,
  selfSurveyPaise: 100_000,
  whatsappNightReply: true,
};

export function checkReminderTiming(timing: ReminderTiming): SettingErrors {
  const errors: SettingErrors = {};
  checkWhole(errors, 'paymentGraceDays', timing.paymentGraceDays, 0, 30);
  checkWhole(errors, 'paymentRepeatDays', timing.paymentRepeatDays, 1, 30);
  checkTime(errors, 'staffDigestTime', timing.staffDigestTime);
  checkTime(errors, 'ownerSummaryTime', timing.ownerSummaryTime);
  checkWhole(errors, 'followUpLeadDays', timing.followUpLeadDays, 0, 7);
  checkWhole(errors, 'subsidyChaseDays', timing.subsidyChaseDays, 1, 60);
  const credit = checkSurveyCredit(timing.selfSurveyPaise);
  if (credit) errors.selfSurveyPaise = credit;
  return errors;
}

/** True once the clock has reached `time` ("HH:MM" against "HH:MM", same day). */
export function timeReached(time: string, now: string): boolean {
  return now >= time;
}

/**
 * Which reminder round an unpaid milestone is in today: the first after the grace days,
 * then one more every repeat. Null while it is still in grace. Each round is sent once.
 */
export function paymentReminderRound(
  dueOn: string,
  today: string,
  timing: Pick<ReminderTiming, 'paymentGraceDays' | 'paymentRepeatDays'>,
): number | null {
  const late = daysBetween(dueOn, today);
  if (late < timing.paymentGraceDays) return null;
  return Math.floor((late - timing.paymentGraceDays) / Math.max(1, timing.paymentRepeatDays));
}

/** The last follow-up date that is reminded today (today plus the lead days). */
export function followUpHorizon(today: string, timing: Pick<ReminderTiming, 'followUpLeadDays'>) {
  return addDays(today, timing.followUpLeadDays);
}
