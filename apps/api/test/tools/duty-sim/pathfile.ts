import type { LatLng } from './geo';

/** What a GPX, KML or GeoJSON file gives: the line, and any named stops (points). */
export interface FileShape {
  line: LatLng[];
  stops: LatLng[];
}

const num = (text: string | undefined) => Number(text);

/** Reads `lat="…" lon="…"` pairs out of tags named `tag`. */
function gpxPoints(text: string, tag: string): LatLng[] {
  const out: LatLng[] = [];
  for (const match of text.matchAll(new RegExp(`<${tag}\\b([^>]*)>`, 'g'))) {
    const attrs = match[1] ?? '';
    const lat = /lat\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1];
    const lon = /lon\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1];
    if (lat && lon) out.push({ latitude: num(lat), longitude: num(lon) });
  }
  return out;
}

export function parseGpx(text: string): FileShape {
  const track = gpxPoints(text, 'trkpt');
  const line = track.length > 0 ? track : gpxPoints(text, 'rtept');
  if (line.length < 2) throw new Error('The GPX file has no track or route line (trkpt/rtept).');
  return { line, stops: gpxPoints(text, 'wpt') };
}

/** KML coordinates are "lng,lat[,alt]" separated by whitespace. */
function kmlCoordinates(block: string): LatLng[] {
  const out: LatLng[] = [];
  for (const match of block.matchAll(/<coordinates>([\s\S]*?)<\/coordinates>/g)) {
    for (const triple of (match[1] ?? '').trim().split(/\s+/)) {
      const [lng, lat] = triple.split(',');
      if (lng && lat) out.push({ latitude: num(lat), longitude: num(lng) });
    }
  }
  return out;
}

export function parseKml(text: string): FileShape {
  const line: LatLng[] = [];
  const stops: LatLng[] = [];
  for (const mark of text.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)) {
    const block = mark[0];
    if (/<LineString\b/.test(block)) line.push(...kmlCoordinates(block));
    else if (/<Point\b/.test(block)) stops.push(...kmlCoordinates(block));
  }
  if (line.length < 2) throw new Error('The KML file has no LineString with two or more points.');
  return { line, stops };
}

type Position = readonly number[];
interface Geometry {
  type?: string;
  coordinates?: unknown;
  geometries?: Geometry[];
}

function collect(geometry: Geometry | undefined, shape: FileShape): void {
  if (!geometry) return;
  const flip = (pos: Position): LatLng => ({ latitude: pos[1] ?? 0, longitude: pos[0] ?? 0 });
  const coords = geometry.coordinates;
  if (geometry.type === 'Point') shape.stops.push(flip(coords as Position));
  else if (geometry.type === 'LineString') shape.line.push(...(coords as Position[]).map(flip));
  else if (geometry.type === 'MultiLineString')
    for (const part of coords as Position[][]) shape.line.push(...part.map(flip));
  else if (geometry.type === 'GeometryCollection')
    for (const inner of geometry.geometries ?? []) collect(inner, shape);
}

export function parseGeoJson(text: string): FileShape {
  const data = JSON.parse(text) as {
    type?: string;
    features?: { geometry?: Geometry }[];
    geometry?: Geometry;
  } & Geometry;
  const shape: FileShape = { line: [], stops: [] };
  if (data.type === 'FeatureCollection')
    for (const f of data.features ?? []) collect(f.geometry, shape);
  else if (data.type === 'Feature') collect(data.geometry, shape);
  else collect(data, shape);
  if (shape.line.length < 2) throw new Error('The GeoJSON file has no LineString.');
  return shape;
}
