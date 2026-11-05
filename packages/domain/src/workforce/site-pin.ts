import { distanceMeters, type GeoPoint } from './attendance';

/** Where a saved site location came from; `whatsapp_pin` is the pin a customer sent in the chat. */
export const LOCATION_SOURCES = ['gps', 'map_pin', 'address', 'typed', 'whatsapp_pin'] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

/**
 * Compares a pin dropped by the field worker with the phone's own reading.
 * A pin with no reading to compare, or farther than the limit, is flagged
 * for the office. Phone accuracy gives no slack: the pin is a deliberate choice.
 */
export function judgeSitePin(
  pin: GeoPoint,
  reading: (GeoPoint & { readonly accuracyM?: number | null | undefined }) | null,
  limitM: number,
): { distanceM: number | null; flagged: boolean } {
  if (reading === null) return { distanceM: null, flagged: true };
  const distanceM = Math.round(distanceMeters(pin, reading));
  return { distanceM, flagged: distanceM > limitM };
}

/**
 * What to do when a new location arrives for a property.
 * An empty location is filled. A map pin or typed coordinates replace what is
 * there. A GPS reading or a geocoded address only fills an empty location, so
 * on a located property the person is asked. Old data with no source counts as GPS.
 */
export function locationChange(
  current: { readonly point: GeoPoint | null; readonly source: LocationSource | null },
  incoming: LocationSource,
): 'fill' | 'replace' | 'ask' {
  if (current.point === null) return 'fill';
  return incoming === 'map_pin' || incoming === 'typed' ? 'replace' : 'ask';
}
