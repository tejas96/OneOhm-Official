import { type DatabaseExecutor, readBusinessCalendar } from '@oneohm/database';
import { type BusinessCalendar, DEFAULT_CALENDAR } from '@oneohm/domain';

/**
 * The business calendar this process last read, for text and for code that cannot wait on the
 * database (a customer message being worded). It is primed when the API starts, refreshed every
 * half minute, and replaced by every `loadCalendar` call, so it is never more than about a
 * minute behind Settings → Working time & holidays.
 */
let snapshot: BusinessCalendar = DEFAULT_CALENDAR;

export const currentCalendar = (): BusinessCalendar => snapshot;

/** Replaces the snapshot (tests; `loadCalendar` does this on every read). */
export function setCurrentCalendar(calendar: BusinessCalendar): void {
  snapshot = calendar;
}

/** The business calendar (cached about a minute in the database package); updates the snapshot. */
export async function loadCalendar(
  db: DatabaseExecutor,
  timeZone?: string,
): Promise<BusinessCalendar> {
  snapshot = await readBusinessCalendar(db, timeZone);
  return snapshot;
}
