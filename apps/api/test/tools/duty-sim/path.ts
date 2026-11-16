import { bearingDeg, distanceM, type LatLng } from './geo';

/** A walkable line plus the labelled stops on it. */
export interface Path {
  readonly line: readonly LatLng[];
  readonly waypoints: readonly LatLng[];
  /** The index in `waypoints` of the customer's site. */
  readonly siteIndex: number;
  readonly source: string;
}

const point = (text: string): LatLng => {
  const [lat, lng] = text.split(',').map((part) => Number(part.trim()));
  if (
    lat === undefined ||
    lng === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    throw new Error(`"${text}" is not a "lat,lng" pair.`);
  }
  return { latitude: lat, longitude: lng };
};

/** `"a;*b;c"` → waypoints, with the index of the one marked `*` (null when none). */
export function parseWaypoints(text: string): { waypoints: LatLng[]; star: number | null } {
  const parts = text
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
  let star: number | null = null;
  const waypoints = parts.map((part, index) => {
    if (part.startsWith('*')) star = index;
    return point(part.replace(/^\*/, ''));
  });
  if (waypoints.length < 2) throw new Error('--route needs at least two waypoints.');
  return { waypoints, star };
}

/** Metres along the line at each vertex (first is 0). */
export function cumulative(line: readonly LatLng[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i += 1) {
    out.push((out[i - 1] ?? 0) + distanceM(line[i - 1] as LatLng, line[i] as LatLng));
  }
  return out;
}

/** Where `metres` along the line is, and which way the line points there. */
export function positionAt(
  line: readonly LatLng[],
  cum: readonly number[],
  metres: number,
): { at: LatLng; heading: number } {
  const total = cum[cum.length - 1] ?? 0;
  const d = Math.min(Math.max(metres, 0), total);
  let i = 1;
  while (i < line.length - 1 && (cum[i] ?? 0) < d) i += 1;
  const from = line[i - 1] as LatLng;
  const to = line[i] as LatLng;
  const span = (cum[i] ?? 0) - (cum[i - 1] ?? 0);
  const share = span > 0 ? (d - (cum[i - 1] ?? 0)) / span : 0;
  return {
    at: {
      latitude: from.latitude + (to.latitude - from.latitude) * share,
      longitude: from.longitude + (to.longitude - from.longitude) * share,
    },
    heading: bearingDeg(from, to),
  };
}

/** Metres along the line of the vertex nearest to `target`. */
export function distanceAlongNearest(
  line: readonly LatLng[],
  cum: readonly number[],
  target: LatLng,
): number {
  let best = 0;
  let bestGap = Number.POSITIVE_INFINITY;
  line.forEach((vertex, index) => {
    const gap = distanceM(vertex, target);
    if (gap < bestGap) {
      bestGap = gap;
      best = cum[index] ?? 0;
    }
  });
  return best;
}

/** A line's own stops when the file has none: start, the middle by length, end. */
export function defaultWaypoints(line: readonly LatLng[]): LatLng[] {
  const cum = cumulative(line);
  const middle = positionAt(line, cum, (cum[cum.length - 1] ?? 0) / 2).at;
  return [line[0] as LatLng, middle, line[line.length - 1] as LatLng];
}
