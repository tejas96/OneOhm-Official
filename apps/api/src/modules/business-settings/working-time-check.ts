import type { WorkingTimeRecord } from '@oneohm/api-contracts';
import {
  checkVisitSettings,
  checkWorkingTime,
  type SettingErrors,
  type VisitSettings,
} from '@oneohm/domain';
import type { Database } from '../../config/core.module';
import { loadPolicy } from '../workforce/policy';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Each holiday must be a real date, listed once. Errors are keyed `holidays.<index>`. */
export function holidayErrors(list: WorkingTimeRecord['holidays']): SettingErrors {
  const errors: SettingErrors = {};
  const seen = new Set<string>();
  list.forEach((holiday, index) => {
    if (
      !DAY.test(holiday.day) ||
      new Date(`${holiday.day}T00:00:00Z`).toISOString().slice(0, 10) !== holiday.day
    )
      errors[`holidays.${index}`] = 'Pick a real date.';
    else if (seen.has(holiday.day))
      errors[`holidays.${index}`] = 'This day is already in the list.';
    seen.add(holiday.day);
  });
  return errors;
}

/** The working-time save check: the calendar on its own, against the saved visit times, and the holidays. */
export function workingTimeErrors(body: WorkingTimeRecord, visits: VisitSettings): SettingErrors {
  return { ...holidayErrors(body.holidays), ...checkWorkingTime(body, visits) };
}

/** The visits save check, against the saved working time (the same function the screen runs). */
export function visitErrors(visits: VisitSettings, work: WorkingTimeRecord): SettingErrors {
  return checkVisitSettings(visits, work);
}

/** Checks visit settings against the working days and hours saved in the workforce policy. */
export async function savedWorkErrors(db: Database, visits: VisitSettings): Promise<SettingErrors> {
  const policy = await loadPolicy(db);
  return checkVisitSettings(visits, {
    weeklyOff: policy.weeklyOff,
    dayStart: policy.attendance.dayStart,
    dayEnd: policy.attendance.dayEnd,
    lunchStart: policy.attendance.lunchStart,
    lunchEnd: policy.attendance.lunchEnd,
  });
}
