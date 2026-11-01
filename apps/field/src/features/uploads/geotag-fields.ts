import type { Geotag } from './queue-logic';

/** EXIF times have no zone; the camera's clock is India time where OneOhm works. */
const INDIA_OFFSET = '+05:30';

/** "2026-11-01T10:22:33" → "2026-11-01T10:22:33+05:30"; instants with a zone pass through. */
export function captureInstant(takenAt: string | null): string | null {
  if (!takenAt) return null;
  if (/(Z|[+-]\d{2}:\d{2})$/.test(takenAt)) return takenAt;
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(takenAt) ? `${takenAt}${INDIA_OFFSET}` : null;
}

/**
 * The upload's form fields for where and when a photo was taken (PRD 4.2). Empty when
 * there is nothing to send; the server keeps coordinates only with consent.
 */
export function geotagFields(geotag: Geotag | null): Record<string, string> {
  if (!geotag) return {};
  const fields: Record<string, string> = {};
  const capturedAt = captureInstant(geotag.takenAt);
  if (capturedAt) fields.capturedAt = capturedAt;
  if (geotag.latitude !== null && geotag.longitude !== null) {
    fields.latitude = String(geotag.latitude);
    fields.longitude = String(geotag.longitude);
    if (geotag.accuracyM != null) fields.accuracyM = String(Math.round(geotag.accuracyM));
  }
  if (Object.keys(fields).length > 0) fields.geoSource = geotag.source ?? 'exif';
  return fields;
}
