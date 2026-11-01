import type { Geotag } from './queue-logic';

type Exif = Readonly<Record<string, unknown>>;

/** "16/1,51/1,1110/100", [16, 51, 11.1] or 16.853 → decimal degrees. */
function degrees(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parts = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\s]+/).filter(Boolean)
      : [];
  if (parts.length === 0) return null;
  const numbers = parts.map((part) => {
    if (typeof part === 'number') return part;
    const [top, bottom] = String(part).split('/').map(Number);
    if (top === undefined || !Number.isFinite(top)) return Number.NaN;
    return bottom === undefined ? top : bottom === 0 ? Number.NaN : top / bottom;
  });
  if (numbers.some((number) => !Number.isFinite(number))) return null;
  const [d = 0, m = 0, s = 0] = numbers;
  return d + m / 60 + s / 3600;
}

function signed(value: unknown, ref: unknown, negative: string): number | null {
  const result = degrees(value);
  if (result === null) return null;
  return typeof ref === 'string' && ref.toUpperCase().startsWith(negative)
    ? -Math.abs(result)
    : result;
}

/** "2026:11:01 10:22:33" (EXIF) → "2026-11-01T10:22:33", local to where it was taken. */
function takenAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
}

const asRecord = (value: unknown): Exif =>
  typeof value === 'object' && value !== null ? (value as Exif) : {};

/**
 * The geotag in a photo's EXIF as the image picker returns it: flat `GPSLatitude` keys
 * (Android) or a `{GPS}` block (iOS). Null when the photo carries no position.
 */
export function geotagFromExif(exif: unknown): Geotag | null {
  const flat = asRecord(exif);
  const gps = asRecord(flat['{GPS}']);
  const latitude = signed(
    flat.GPSLatitude ?? gps.Latitude,
    flat.GPSLatitudeRef ?? gps.LatitudeRef,
    'S',
  );
  const longitude = signed(
    flat.GPSLongitude ?? gps.Longitude,
    flat.GPSLongitudeRef ?? gps.LongitudeRef,
    'W',
  );
  if (latitude === null || longitude === null) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  const exifBlock = asRecord(flat['{Exif}']);
  return {
    latitude,
    longitude,
    takenAt: takenAt(flat.DateTimeOriginal ?? exifBlock.DateTimeOriginal ?? flat.DateTime),
  };
}
