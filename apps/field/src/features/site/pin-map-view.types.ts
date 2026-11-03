import type { GeoPoint } from '@oneohm/domain';
import type { PinStart } from './pin-flow';

/**
 * The satellite map inside the pin sheet, one file per platform (expo-maps: Google Maps
 * on Android, Apple Maps on iOS). Map imports stay in those files so tests never load
 * native code.
 */
export interface PinMapViewProps {
  /** Where the map opens: the worker's reading, else the saved point. */
  readonly first: GeoPoint;
  /** The worker's reading; its accuracy is drawn as a circle. */
  readonly start: PinStart | null;
  /** The site's saved point, shown as a marker. */
  readonly saved: GeoPoint | null;
  readonly savedTitle: string;
  /** Theme accent (#RRGGBB) for the circle and the marker. */
  readonly accent: string;
  /** The map is showing, so "This is the roof" can be pressed. */
  readonly onReady: () => void;
  /** The camera stopped moving: its centre is what the fixed pin points at. */
  readonly onCentre: (centre: GeoPoint) => void;
}

/** How much of the map the sheet opens on: a house and its yard. */
export const PIN_SPAN_M = 40;

/** A camera event's centre as a point, or null while it has none. */
export function centreOf(coordinates: {
  readonly latitude?: number;
  readonly longitude?: number;
}): GeoPoint | null {
  const { latitude, longitude } = coordinates;
  return latitude === undefined || longitude === undefined ? null : { latitude, longitude };
}
