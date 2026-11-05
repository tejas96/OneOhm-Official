import { addDays } from '@oneohm/shared';

/**
 * Workload and capacity (PRD 3.12). A person may carry a limit of open tasks; without
 * their own, the company default applies, and 0 (or nothing) means no limit.
 */
export function openTaskLimit(
  personal: number | null | undefined,
  companyDefault: number,
): number | null {
  if (personal !== null && personal !== undefined && personal > 0) return personal;
  return companyDefault > 0 ? companyDefault : null;
}

export type LoadState = 'ok' | 'full' | 'over';

/** At the limit is "full" (one more goes over); above it is "over". */
export function loadState(open: number, limit: number | null): LoadState {
  if (limit === null) return 'ok';
  if (open > limit) return 'over';
  return open === limit ? 'full' : 'ok';
}

/** Whether handing this person one more task takes them over their limit. */
export function wouldOverload(open: number, limit: number | null): boolean {
  return limit !== null && open + 1 > limit;
}

export interface WeekWindow {
  readonly from: string;
  readonly to: string;
}

/** The next `weeks` weeks from today, seven days each (week one starts today). */
export function weekWindows(today: string, weeks = 4): WeekWindow[] {
  return Array.from({ length: weeks }, (_, index) => ({
    from: addDays(today, index * 7),
    to: addDays(today, index * 7 + 6),
  }));
}

/**
 * Open tasks due in each week. Anything already overdue counts in the first week, since
 * it still has to be done now; anything due after the last week is left out.
 */
export function dueByWeek(dueDates: readonly string[], windows: readonly WeekWindow[]): number[] {
  const counts = windows.map(() => 0);
  const first = windows[0];
  if (!first) return counts;
  for (const due of dueDates) {
    if (due < first.from) {
      counts[0] = (counts[0] ?? 0) + 1;
      continue;
    }
    const index = windows.findIndex((week) => due >= week.from && due <= week.to);
    if (index >= 0) counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

/**
 * Days of leave inside each week (inclusive ranges). A half day counts 0.5. Pass only the
 * leave that should count: approved leave is away time, pending leave is only asked for.
 */
export function leaveDaysByWeek(
  leave: readonly { readonly from: string; readonly to: string; readonly halfDay?: boolean }[],
  windows: readonly WeekWindow[],
): number[] {
  return windows.map((week) => {
    let days = 0;
    for (let offset = 0; offset < 7; offset += 1) {
      const day = addDays(week.from, offset);
      if (day > week.to) break;
      const covering = leave.filter((range) => range.from <= day && day <= range.to);
      if (covering.length === 0) continue;
      // A whole day wins over a half day on the same date.
      days += covering.some((range) => !(range.halfDay && range.from === range.to)) ? 1 : 0.5;
    }
    return days;
  });
}
