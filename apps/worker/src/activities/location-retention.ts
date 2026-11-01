import { clearExpiredLocations, type Database } from '@oneohm/database';

/**
 * Clears raw coordinates past the retention period in Settings (PRD 4.3, privacy):
 * day check-ins, site check-ins and photo geotags. Distances and flags stay.
 */
export async function clearOldLocations(db: Database, today: string): Promise<number> {
  const cleared = await clearExpiredLocations(db, today);
  return cleared.attendanceDays + cleared.siteVisits + cleared.photos;
}
