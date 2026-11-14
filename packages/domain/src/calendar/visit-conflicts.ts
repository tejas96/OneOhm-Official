import { type BusinessCalendar, isWorkingDay } from './business-calendar';
import { overlaps } from './slots';

/** An upcoming open visit, as far as the calendar cares. */
export interface UpcomingVisit {
  readonly id: string;
  readonly day: string;
  /** Null for older visits that only know morning or afternoon. */
  readonly startMin: number | null;
  readonly endMin: number | null;
}

/**
 * The open visits a calendar change leaves outside working time: on a day off or holiday, or
 * outside the opening hours or in the lunch break. They are not blocked or moved; the page
 * lists them so someone can move each one.
 */
export function visitsOutsideCalendar(
  cal: BusinessCalendar,
  upcoming: readonly UpcomingVisit[],
): UpcomingVisit[] {
  return upcoming.filter((visit) => {
    if (!isWorkingDay(visit.day, cal)) return true;
    if (visit.startMin === null || visit.endMin === null) return false;
    if (visit.startMin < cal.startMin || visit.endMin > cal.endMin) return true;
    return (
      cal.lunch !== null && overlaps({ startMin: visit.startMin, endMin: visit.endMin }, cal.lunch)
    );
  });
}
