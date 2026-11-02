import { addDays } from '@oneohm/shared';

/** Approved leave, as calendar dates (inclusive). */
export interface LeaveSpan {
  readonly from: string;
  readonly to: string;
}

const covered = (day: string, leave: readonly LeaveSpan[]) =>
  leave.some((span) => span.from <= day && day <= span.to);

/**
 * Days since the last update, not counting days the person was on approved leave
 * (spec 3.5). The day of the update itself does not count; today does.
 */
export function idleDays(lastUpdate: string, today: string, leave: readonly LeaveSpan[]): number {
  let days = 0;
  for (let day = addDays(lastUpdate, 1); day <= today; day = addDays(day, 1)) {
    if (!covered(day, leave)) days += 1;
  }
  return days;
}

/** Only work someone can move now goes stale: ready or in progress, quiet for too long. */
export function isStale(input: {
  readonly status: string;
  readonly lastUpdate: string;
  readonly today: string;
  readonly leave: readonly LeaveSpan[];
  readonly thresholdDays: number;
}): boolean {
  if (input.status !== 'ready' && input.status !== 'in_progress') return false;
  return idleDays(input.lastUpdate, input.today, input.leave) >= input.thresholdDays;
}

export function onLeave(today: string, leave: readonly LeaveSpan[]): boolean {
  return covered(today, leave);
}
