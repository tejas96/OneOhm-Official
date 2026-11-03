/** A point on the map, in the shape Google Maps uses. */
export interface GeoPoint {
  readonly lat: number;
  readonly lng: number;
}

/** Kolhapur: where the map opens when neither the site nor the company base is known. */
export const KOLHAPUR: GeoPoint = { lat: 16.705, lng: 74.2433 };

const number = (text: string): number | null => {
  const trimmed = text.trim();
  const value = Number(trimmed);
  return trimmed === '' || !Number.isFinite(value) ? null : value;
};

const onEarth = (lat: number, lng: number) => Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Moves a point between the map and the latitude/longitude text inputs. */
export const pinMapValue = {
  /** Typed latitude and longitude → a point; blank, not a number or off the earth → null. */
  parse(lat: string, lng: string): GeoPoint | null {
    const latitude = number(lat);
    const longitude = number(lng);
    if (latitude === null || longitude === null || !onEarth(latitude, longitude)) return null;
    return { lat: latitude, lng: longitude };
  },
  /** A point → the text for the two inputs, 6 decimals (about 10 cm). */
  format(point: GeoPoint): { latitude: string; longitude: string } {
    return { latitude: point.lat.toFixed(6), longitude: point.lng.toFixed(6) };
  },
  /** Saved numbers (either may be missing) → a point, or null. */
  fromNumbers(lat: number | null | undefined, lng: number | null | undefined): GeoPoint | null {
    if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
    return onEarth(lat, lng) ? { lat, lng } : null;
  },
};
