import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LatLng } from './geo';

/** The public demo router; only the waypoint coordinates are sent, nothing else. */
export function osrmUrl(waypoints: readonly LatLng[]): string {
  const coords = waypoints.map((p) => `${p.longitude},${p.latitude}`).join(';');
  return `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
}

interface OsrmReply {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] } }[];
}

/** The road line through the waypoints; the answer is cached in `cacheDir` by request. */
export async function roadLine(waypoints: readonly LatLng[], cacheDir: string): Promise<LatLng[]> {
  const url = osrmUrl(waypoints);
  const file = join(
    cacheDir,
    `osrm-${createHash('sha1').update(url).digest('hex').slice(0, 12)}.json`,
  );
  let reply: OsrmReply;
  if (existsSync(file)) {
    reply = JSON.parse(readFileSync(file, 'utf8')) as OsrmReply;
  } else {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'user-agent': 'duty-sim-dev-tool' } });
    } catch (error) {
      throw new Error(
        `Could not reach the OSRM demo server (${String(error)}). Use --gpx/--kml/--geojson or the demo path.`,
      );
    }
    if (!res.ok) throw new Error(`OSRM answered ${res.status}. Try again later or use a file.`);
    reply = (await res.json()) as OsrmReply;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, JSON.stringify(reply));
  }
  const coordinates = reply.routes?.[0]?.geometry.coordinates;
  if (reply.code !== 'Ok' || !coordinates) throw new Error(`OSRM found no route (${reply.code}).`);
  return coordinates.map(([longitude, latitude]) => ({ latitude, longitude }));
}
