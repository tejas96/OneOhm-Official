export interface LatLng {
  latitude: number;
  longitude: number;
}

const EARTH_M = 6_371_008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a to b, 0..360. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const dLng = rad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(rad(b.latitude));
  const x =
    Math.cos(rad(a.latitude)) * Math.sin(rad(b.latitude)) -
    Math.sin(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** The point `northM` north and `eastM` east of `from` (flat-earth, fine for a few km). */
export function offsetM(from: LatLng, northM: number, eastM: number): LatLng {
  return {
    latitude: from.latitude + deg(northM / EARTH_M),
    longitude: from.longitude + deg(eastM / (EARTH_M * Math.cos(rad(from.latitude)))),
  };
}

/** A small seeded random generator (mulberry32), so a run can be repeated with --seed. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A normally distributed number (Box-Muller). */
export function gaussian(random: () => number, sigma: number): number {
  const u = Math.max(random(), 1e-12);
  return sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}
