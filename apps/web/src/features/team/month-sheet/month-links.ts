import type { MonthSheetPerson } from '@oneohm/api-contracts';
import type { MonthFlagKind } from '@oneohm/domain';

/** The person's day on the live map: route, visits and alerts for that date. */
export const dayHref = (userId: string, date: string) =>
  `/live?day=${encodeURIComponent(userId)}&date=${date}`;

export interface FixLink {
  /** Which words describe the link (a message key under `team.monthSheet.fix`). */
  readonly kind: 'day' | 'correction' | 'leave' | 'claim' | 'alert';
  readonly href: string;
  /** The calendar date it is about, or null for a leave range or claim without one day. */
  readonly date: string | null;
  /** Free text for the link (a leave's name, an alert's title); null when the date says it. */
  readonly detail: string | null;
}

type Items = MonthSheetPerson['items'];

/**
 * Where each flag is fixed: the correction, leave, claim or alert itself where one exists, and
 * the person's day on the live map for everything about what happened on a day.
 */
export function fixLinks(
  kind: MonthFlagKind,
  days: readonly string[],
  userId: string,
  items: Items,
): FixLink[] {
  const onDays: FixLink[] = days.map((date) => ({
    kind: 'day',
    href: dayHref(userId, date),
    date,
    detail: null,
  }));
  switch (kind) {
    case 'open_correction':
      return items.corrections.length > 0
        ? items.corrections.map((item) => ({
            kind: 'correction',
            href: `/team?tab=attendance&correction=${item.id}`,
            date: item.workDate,
            detail: null,
          }))
        : onDays;
    case 'pending_leave':
      return items.leaves
        .filter((item) => item.status === 'pending')
        .map((item) => ({
          kind: 'leave',
          href: `/team?tab=leave&leave=${item.id}`,
          date: item.fromDate,
          detail: item.label,
        }));
    case 'pending_travel':
      return items.claims
        .filter((item) => item.status === 'pending')
        .map((item) => ({
          kind: 'claim',
          href: `/team?tab=travel&claim=${item.id}`,
          date: item.workDate,
          detail: null,
        }));
    case 'open_alert':
      return items.alerts.length > 0
        ? items.alerts.map((item) => ({
            kind: 'alert',
            href: `/live?tab=alerts&alert=${item.id}`,
            date: item.day,
            detail: item.title,
          }))
        : onDays;
    default:
      return onDays;
  }
}

/** The claim's own sheet on Team → Travel. */
export const claimHref = (id: string) => `/team?tab=travel&claim=${id}`;
/** The leave request on Team → Leave. */
export const leaveHref = (id: string) => `/team?tab=leave&leave=${id}`;
