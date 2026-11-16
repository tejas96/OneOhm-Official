import { type DutyAlertKind, plannedVisitMissed } from './duty-alert-rules';

/**
 * When a duty alert closes itself, opens again, or goes up to the owner (Duty Day step 5).
 * Pure: the five-minute job hands over what is true now about each open alert's cause.
 */

/** The reason kept on an alert the system closed because its cause was fixed. */
export const AUTO_RESOLVED_REASON = 'auto';

/** The morning digest counts open alerts raised on the last this many days, no older. */
export const ESCALATE_MAX_DAYS = 2;

/**
 * A closed alert opens again only for a cause that began after it was closed: a person who
 * dealt with it is not overruled by the same cause, and a fixed cause that comes back is new.
 */
export function mayReopen(resolvedAt: Date | null, causeSince: Date): boolean {
  return resolvedAt !== null && causeSince.getTime() > resolvedAt.getTime();
}

/** The planned visit an open `visit_missed` alert is about, as it stands now. */
export interface PlannedNow {
  readonly status: string;
  readonly day: string;
  readonly startMin: number | null;
}

/** What is true now about an open alert's cause, by kind. */
export type CauseNow =
  | { readonly kind: 'not_checked_in'; readonly checkedIn: boolean; readonly away: boolean }
  | { readonly kind: 'visit_open_long'; readonly visitClosed: boolean }
  | {
      readonly kind: 'visit_missed';
      /** Someone checked in at that work on the alert's day. */
      readonly arrived: boolean;
      /** Null when the planned visit is gone. */
      readonly planned: PlannedNow | null;
      readonly alertDay: string;
      readonly today: string;
      readonly nowMin: number;
    }
  | { readonly kind: 'claim_waiting'; readonly status: string | null }
  | { readonly kind: 'claim_unpaid'; readonly status: string | null; readonly paid: boolean }
  | { readonly kind: 'visit_doubtful'; readonly proof: string | null };

/** The kinds the five-minute job closes by itself once the cause is fixed. */
export const SELF_CLOSING_KINDS = [
  'not_checked_in',
  'visit_open_long',
  'visit_missed',
  'claim_waiting',
  'claim_unpaid',
  'visit_doubtful',
] as const satisfies readonly DutyAlertKind[];
export type SelfClosingKind = (typeof SELF_CLOSING_KINDS)[number];

const WAITING_VISIT = ['proposed', 'confirmed'];

/**
 * The cause is fixed: checked in (or away on leave that day); the visit closed; someone
 * reached the work, or the planned visit was cancelled, done, moved to another day or to a
 * start not yet 30 minutes past; the claim decided, withdrawn or voided; the approved claim
 * paid or voided; the visit's proof now verified.
 */
export function causeGone(cause: CauseNow): boolean {
  switch (cause.kind) {
    case 'not_checked_in':
      return cause.checkedIn || cause.away;
    case 'visit_open_long':
      return cause.visitClosed;
    case 'visit_missed': {
      const { planned } = cause;
      if (cause.arrived || !planned || !WAITING_VISIT.includes(planned.status)) return true;
      if (planned.day !== cause.alertDay) return true;
      if (cause.alertDay !== cause.today) return false;
      return !plannedVisitMissed({
        plannedStartMin: planned.startMin,
        nowMin: cause.nowMin,
        arrived: false,
      });
    }
    case 'claim_waiting':
      return cause.status !== 'pending';
    case 'claim_unpaid':
      return cause.paid || cause.status !== 'approved';
    case 'visit_doubtful':
      return cause.proof === 'verified';
  }
}

/** "7 field alerts from yesterday still open", for the owner's morning digest. */
export function alertDigestTitle(count: number, onlyYesterday: boolean): string {
  const alerts = count === 1 ? '1 field alert' : `${count} field alerts`;
  return `${alerts} from ${onlyYesterday ? 'yesterday' : `the last ${ESCALATE_MAX_DAYS} days`} still open`;
}
