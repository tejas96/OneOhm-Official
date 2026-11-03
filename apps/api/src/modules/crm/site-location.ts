import { type Database, type DatabaseExecutor, properties } from '@oneohm/database';
import type { GeoPoint } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { conflict, notFound } from '../../common/http/errors';

type PropertyRow = typeof properties.$inferSelect;
type WebSource = 'map_pin' | 'typed';

const pointOf = (latitude: number | null | undefined, longitude: number | null | undefined) =>
  latitude !== null && latitude !== undefined && longitude !== null && longitude !== undefined
    ? { latitude, longitude }
    : null;

const samePoint = (a: GeoPoint | null, b: GeoPoint | null) =>
  a === b || (a !== null && b !== null && a.latitude === b.latitude && a.longitude === b.longitude);

/**
 * The location columns for a point the office set on the web (design 6.2): how it was set
 * and by whom, the point it replaces kept to put back, and any field flag cleared. Office
 * edits are not held to the field pin's trust limit. Null when the point did not change.
 */
export function webLocation(
  actor: Actor,
  current: { latitude: number | null; longitude: number | null } | null,
  next: { latitude?: number | null | undefined; longitude?: number | null | undefined },
  source: WebSource | undefined,
) {
  if (next.latitude === undefined && next.longitude === undefined) return null;
  const before = current ? pointOf(current.latitude, current.longitude) : null;
  const after = pointOf(
    next.latitude === undefined ? current?.latitude : next.latitude,
    next.longitude === undefined ? current?.longitude : next.longitude,
  );
  if (samePoint(before, after)) return null;
  return {
    fields: {
      locationSource: after ? (source ?? 'typed') : null,
      locationAccuracyM: null,
      locatedAt: new Date(),
      locatedByUserId: actor.userId,
      locationFlagged: false,
      locationFlagDistanceM: null,
      ...(before ? { previousLatitude: before.latitude, previousLongitude: before.longitude } : {}),
    },
    audit: { source: after ? (source ?? 'typed') : null, previous: before },
  };
}

async function lockedSite(tx: DatabaseExecutor, id: string): Promise<PropertyRow> {
  const [row] = await tx.select().from(properties).where(eq(properties.id, id)).for('update');
  if (!row) throw notFound('That property');
  return row;
}

/** The office keeps a flagged site pin as it is. */
export async function confirmSiteLocation(db: Database, actor: Actor, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockedSite(tx, id);
    await tx
      .update(properties)
      .set({ locationFlagged: false, locationFlagDistanceM: null, updatedAt: new Date() })
      .where(eq(properties.id, id));
    await recordAudit(tx, actor.userId, 'property.location_confirmed', 'property', id, {
      flagged: row.locationFlagged,
      flagDistanceM: row.locationFlagDistanceM,
      point: pointOf(row.latitude, row.longitude),
    });
  });
}

/** Puts back the earlier site point; the current one becomes the earlier one. */
export async function restoreSiteLocation(db: Database, actor: Actor, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockedSite(tx, id);
    const previous = pointOf(row.previousLatitude, row.previousLongitude);
    if (!previous) throw conflict('There is no earlier site location to put back.', 'no_previous');
    await tx
      .update(properties)
      .set({
        latitude: previous.latitude,
        longitude: previous.longitude,
        previousLatitude: row.latitude,
        previousLongitude: row.longitude,
        locationFlagged: false,
        locationFlagDistanceM: null,
        updatedAt: new Date(),
      })
      .where(eq(properties.id, id));
    await recordAudit(tx, actor.userId, 'property.location_restored', 'property', id, {
      point: previous,
      replaced: pointOf(row.latitude, row.longitude),
    });
  });
}
