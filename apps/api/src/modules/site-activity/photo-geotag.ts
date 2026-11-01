import type { GeotagFields, PhotoGeotag } from '@oneohm/api-contracts';
import { type DatabaseExecutor, documentGeotags, properties } from '@oneohm/database';
import { siteDistance } from '@oneohm/domain';
import { eq, inArray } from 'drizzle-orm';
import { usableReading } from '../workforce/tracking';

/** A capture time is trusted unless it is in the future (a phone clock far ahead). */
function captureTime(value: string | undefined, now: Date): Date | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 5 * 60_000) return null;
  return at;
}

async function siteOf(db: DatabaseExecutor, propertyId: string | null) {
  if (!propertyId) return null;
  const [row] = await db
    .select({ latitude: properties.latitude, longitude: properties.longitude })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);
  return row?.latitude != null && row.longitude != null
    ? { latitude: row.latitude, longitude: row.longitude }
    : null;
}

/**
 * Keeps where and when a field photo was taken with its document (PRD 4.2). The time is
 * always kept; the coordinates only when the person has agreed to share location and
 * the photo was taken in working hours. The distance from the site is kept after the
 * coordinates are cleared.
 */
export async function recordPhotoGeotag(
  db: DatabaseExecutor,
  input: {
    readonly documentId: string;
    readonly userId: string;
    readonly propertyId: string | null;
    readonly contentType: string;
    readonly fields: GeotagFields;
  },
): Promise<void> {
  const { fields } = input;
  if (!input.contentType.startsWith('image/')) return;
  const position =
    fields.latitude !== undefined && fields.longitude !== undefined
      ? { latitude: fields.latitude, longitude: fields.longitude, accuracyM: fields.accuracyM }
      : null;
  if (!position && !fields.capturedAt) return;
  const now = new Date();
  const capturedAt = captureTime(fields.capturedAt, now);
  const reading = await usableReading(db, input.userId, position, capturedAt ?? now);
  const measured = reading
    ? siteDistance(
        reading.position,
        await siteOf(db, input.propertyId),
        reading.policy.travel.farFromSiteM,
      )
    : null;
  await db
    .insert(documentGeotags)
    .values({
      documentId: input.documentId,
      capturedAt,
      source: fields.geoSource ?? (position ? 'device' : 'exif'),
      latitude: reading?.position.latitude ?? null,
      longitude: reading?.position.longitude ?? null,
      accuracyM:
        reading?.position.accuracyM == null ? null : Math.round(reading.position.accuracyM),
      distanceM: measured?.distanceM ?? null,
      farFromSite: measured?.far ?? null,
    })
    .onConflictDoNothing();
}

/** The geotags of a set of documents, as shown with them (never the raw coordinates). */
export async function geotagsOf(
  db: DatabaseExecutor,
  documentIds: readonly string[],
): Promise<Map<string, PhotoGeotag>> {
  if (documentIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(documentGeotags)
    .where(inArray(documentGeotags.documentId, [...documentIds]));
  return new Map(
    rows.map((row) => [
      row.documentId,
      {
        capturedAt: row.capturedAt?.toISOString() ?? null,
        source: row.source,
        located: row.latitude !== null || row.distanceM !== null,
        distanceM: row.distanceM,
        farFromSite: row.farFromSite,
      },
    ]),
  );
}
