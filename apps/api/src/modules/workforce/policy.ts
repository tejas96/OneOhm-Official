import { type DatabaseExecutor, workforcePolicy, workLocations } from '@oneohm/database';
import { DEFAULT_WORKFORCE_POLICY, type WorkforcePolicy, type WorkLocation } from '@oneohm/domain';
import { asc, eq } from 'drizzle-orm';

/** The current rules; the defaults until an owner saves their own. */
export async function loadPolicy(db: DatabaseExecutor): Promise<WorkforcePolicy> {
  const [row] = await db
    .select({ policy: workforcePolicy.policy })
    .from(workforcePolicy)
    .where(eq(workforcePolicy.id, 'default'))
    .limit(1);
  return row?.policy ?? DEFAULT_WORKFORCE_POLICY;
}

/** Every authorised place (active or not), oldest first. */
export async function loadLocations(db: DatabaseExecutor) {
  return db.select().from(workLocations).orderBy(asc(workLocations.createdAt));
}

/** Active places in the shape the distance rules read. */
export async function activeLocations(db: DatabaseExecutor): Promise<WorkLocation[]> {
  const rows = await loadLocations(db);
  return rows
    .filter((row) => row.active)
    .map(({ id, name, latitude, longitude, radiusM }) => ({
      id,
      name,
      latitude,
      longitude,
      radiusM,
    }));
}

const clock = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Kolkata',
});

/** "HH:MM" in India time for a moment. */
export const indiaTime = (at: Date) => clock.format(at);

/** The calendar year (India time) a date falls in, as its first and last day. */
export const yearOf = (date: string) => ({
  from: `${date.slice(0, 4)}-01-01`,
  to: `${date.slice(0, 4)}-12-31`,
});
