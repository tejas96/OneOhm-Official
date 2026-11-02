import type { GeoPoint } from '@oneohm/domain';

/**
 * A Google Maps link to the site: straight to the coordinates when the site has a point,
 * else a search for the address text, else null (nothing to navigate to).
 */
export function directionsUrl(point: GeoPoint | null, address: string | null): string | null {
  if (point) {
    return `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
  }
  const text = address?.trim();
  if (!text) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}
