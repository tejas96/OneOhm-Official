import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Args } from './args';
import { demoPath } from './demo';
import { type LatLng } from './geo';
import { roadLine } from './osrm';
import { defaultWaypoints, type Path, parseWaypoints } from './path';
import { type FileShape, parseGeoJson, parseGpx, parseKml } from './pathfile';

function checked(path: Path, siteIndex: number | undefined): Path {
  const index = siteIndex ?? path.siteIndex;
  if (index < 0 || index >= path.waypoints.length) {
    throw new Error(`--site-index ${index} is outside 0..${path.waypoints.length - 1}.`);
  }
  return { ...path, siteIndex: index };
}

function fromFile(shape: FileShape, name: string, siteIndex: number | undefined): Path {
  const waypoints: LatLng[] = shape.stops.length >= 2 ? shape.stops : defaultWaypoints(shape.line);
  return checked({ line: shape.line, waypoints, siteIndex: 1, source: name }, siteIndex);
}

/** The path to walk: OSRM road geometry, a file's line, or the built-in demo path. */
export async function resolvePath(args: Args, cacheDir: string): Promise<Path> {
  if (args.route) {
    const { waypoints, star } = parseWaypoints(args.route);
    const line = await roadLine(waypoints, cacheDir);
    return checked(
      { line, waypoints, siteIndex: star ?? 1, source: 'OSRM road route' },
      args.siteIndex,
    );
  }
  const file = args.gpx ?? args.kml ?? args.geojson;
  if (file) {
    // pnpm runs from the package folder; relative file names mean where the person typed them.
    const text = readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8');
    const shape = args.gpx ? parseGpx(text) : args.kml ? parseKml(text) : parseGeoJson(text);
    return fromFile(shape, `file ${file}`, args.siteIndex);
  }
  return checked(demoPath(), args.siteIndex);
}
