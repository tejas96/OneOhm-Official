const SERVICE = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 2_500;
export const GEOCODE_CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 2_000;

/** The place names a point falls in; any of them may be missing. */
export interface GeoPlace {
  readonly locality: string | null;
  readonly district: string | null;
  readonly sublocality: string | null;
}

type Fetch = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

/** The geocoder for this server's keys: the server key first, then the shared one. */
export const reverseGeocodeFor = (
  env: {
    readonly GOOGLE_MAPS_SERVER_KEY?: string | undefined;
    readonly GOOGLE_MAPS_API_KEY?: string | undefined;
  },
  fetchImpl?: Fetch,
): ReverseGeocode =>
  createReverseGeocode(
    { server: env.GOOGLE_MAPS_SERVER_KEY, shared: env.GOOGLE_MAPS_API_KEY },
    fetchImpl,
  );

export type ReverseGeocode = (latitude: number, longitude: number) => Promise<GeoPlace | null>;

type Component = { readonly long_name?: unknown; readonly types?: unknown };

const nameOf = (components: readonly Component[], type: string): string | null => {
  const found = components.find((c) => Array.isArray(c.types) && c.types.includes(type));
  return typeof found?.long_name === 'string' && found.long_name.trim()
    ? found.long_name.trim()
    : null;
};

/** The place names in the first geocoding result that has any, or null. */
export function placeFrom(body: unknown): GeoPlace | null {
  const results = (body as { results?: { address_components?: Component[] }[] } | null)?.results;
  if (!Array.isArray(results)) return null;
  for (const result of results) {
    const parts = Array.isArray(result.address_components) ? result.address_components : [];
    const place: GeoPlace = {
      locality: nameOf(parts, 'locality'),
      district:
        nameOf(parts, 'administrative_area_level_3') ??
        nameOf(parts, 'administrative_area_level_2'),
      sublocality: nameOf(parts, 'sublocality') ?? nameOf(parts, 'sublocality_level_1'),
    };
    if (place.locality || place.district || place.sublocality) return place;
  }
  return null;
}

/**
 * Names the place a point is in, through Google's Geocoding API. Answers are remembered
 * for 24 hours (points rounded to about 100 m). With no key, or on any failure or
 * timeout, the answer is null: the lookup never throws.
 */
export function createReverseGeocode(
  keys: { readonly server?: string | undefined; readonly shared?: string | undefined },
  fetchImpl: Fetch = fetch,
  now: () => number = Date.now,
): ReverseGeocode {
  const key = keys.server?.trim() || keys.shared?.trim() || null;
  const cache = new Map<string, { at: number; place: GeoPlace | null }>();

  return async function reverse(latitude, longitude) {
    if (!key) return null;
    const id = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    const hit = cache.get(id);
    if (hit && now() - hit.at < GEOCODE_CACHE_MS) return hit.place;
    try {
      const query = new URLSearchParams({
        latlng: `${latitude},${longitude}`,
        result_type: 'locality|sublocality|administrative_area_level_3|administrative_area_level_2',
        language: 'en',
        key,
      });
      const response = await fetchImpl(`${SERVICE}?${query}`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { status?: unknown };
      if (body.status !== 'OK' && body.status !== 'ZERO_RESULTS') return null;
      const place = placeFrom(body);
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
      cache.set(id, { at: now(), place });
      return place;
    } catch {
      return null;
    }
  };
}
