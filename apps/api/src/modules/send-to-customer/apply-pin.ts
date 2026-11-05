import { type DatabaseExecutor, properties } from '@oneohm/database';
import type { GeoPoint } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { notFound } from '../../common/http/errors';

/** The point a home has now, or null. Locked, so two pins do not both think the home is empty. */
export async function lockedPoint(tx: DatabaseExecutor, propertyId: string) {
  const [row] = await tx
    .select({ latitude: properties.latitude, longitude: properties.longitude })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .for('update');
  if (!row) throw notFound('That home');
  return row.latitude !== null && row.longitude !== null
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;
}

/**
 * Saves a pin from WhatsApp on a home (`location_source = whatsapp_pin`). The point it
 * replaces is kept to put back, as for every change; `byUserId` is the team member who
 * accepted a suggestion (null when the customer's pin filled an empty home).
 */
export async function savePin(
  tx: DatabaseExecutor,
  propertyId: string,
  pin: GeoPoint,
  previous: GeoPoint | null,
  byUserId: string | null,
  via: 'filled' | 'accepted',
): Promise<void> {
  const now = new Date();
  await tx
    .update(properties)
    .set({
      latitude: pin.latitude,
      longitude: pin.longitude,
      locationSource: 'whatsapp_pin',
      locationAccuracyM: null,
      locatedAt: now,
      locatedByUserId: byUserId,
      locationFlagged: false,
      locationFlagDistanceM: null,
      ...(previous
        ? { previousLatitude: previous.latitude, previousLongitude: previous.longitude }
        : {}),
      updatedAt: now,
    })
    .where(eq(properties.id, propertyId));
  await recordAudit(tx, byUserId, 'property.located', 'property', propertyId, {
    source: 'whatsapp_pin',
    via,
    previous,
  });
}
