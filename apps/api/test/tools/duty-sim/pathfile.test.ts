import { describe, expect, it } from 'vitest';
import { parseArgs } from './args';
import { parseGeoJson, parseGpx, parseKml } from './pathfile';
import { acceptanceDbUrl, safeApiUrl } from './safety';

describe('reading a path file', () => {
  it('GPX: track points as the line, waypoints as stops', () => {
    const gpx = `<gpx><wpt lat="16.1" lon="74.1"><name>Home</name></wpt>
      <trk><trkseg><trkpt lat="16.10" lon="74.10"><ele>5</ele></trkpt><trkpt lat="16.20" lon="74.20"/></trkseg></trk></gpx>`;
    const shape = parseGpx(gpx);
    expect(shape.line).toEqual([
      { latitude: 16.1, longitude: 74.1 },
      { latitude: 16.2, longitude: 74.2 },
    ]);
    expect(shape.stops).toHaveLength(1);
    expect(() => parseGpx('<gpx/>')).toThrow();
  });

  it('KML (Google My Maps): LineString lng,lat order, Points as stops', () => {
    const kml = `<kml><Document>
      <Placemark><name>Site</name><Point><coordinates>74.5,16.5,0</coordinates></Point></Placemark>
      <Placemark><LineString><coordinates>
        74.1,16.1,0 74.2,16.2,0
        74.3,16.3,0</coordinates></LineString></Placemark></Document></kml>`;
    const shape = parseKml(kml);
    expect(shape.line).toHaveLength(3);
    expect(shape.line[0]).toEqual({ latitude: 16.1, longitude: 74.1 });
    expect(shape.stops).toEqual([{ latitude: 16.5, longitude: 74.5 }]);
  });

  it('GeoJSON: features, a bare LineString and a multi-line', () => {
    const feature = JSON.stringify({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [74.1, 16.1],
              [74.2, 16.2],
            ],
          },
        },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [74.15, 16.15] } },
      ],
    });
    expect(parseGeoJson(feature).line[1]).toEqual({ latitude: 16.2, longitude: 74.2 });
    expect(parseGeoJson(feature).stops).toHaveLength(1);
    const bare = JSON.stringify({
      type: 'LineString',
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
    expect(parseGeoJson(bare).line).toHaveLength(2);
    expect(() => parseGeoJson(JSON.stringify({ type: 'Point', coordinates: [1, 2] }))).toThrow();
  });
});

describe('safety and flags', () => {
  it('only the local acceptance API, never port 4200', () => {
    expect(safeApiUrl(undefined)).toBe('http://localhost:4300/v1');
    expect(safeApiUrl('http://127.0.0.1:4300')).toBe('http://127.0.0.1:4300/v1');
    expect(() => safeApiUrl('http://127.0.0.1:4301')).toThrow(/4300/);
    expect(() => safeApiUrl('http://localhost:4200')).toThrow(/4300/);
    expect(() => safeApiUrl('https://api.example.com')).toThrow(/local/);
  });

  it('only the database oneohm_acceptance', () => {
    expect(acceptanceDbUrl(undefined, 'postgres://u:p@localhost:5432/oneohm')).toBe(
      'postgres://u:p@localhost:5432/oneohm_acceptance',
    );
    expect(() => acceptanceDbUrl('postgres://u:p@localhost:5432/oneohm', undefined)).toThrow(
      /oneohm_acceptance/,
    );
    expect(acceptanceDbUrl('postgres://u:p@localhost:5432/oneohm_acceptance', undefined)).toContain(
      'oneohm_acceptance',
    );
  });

  it('parses flags and refuses unknown ones', () => {
    const args = parseArgs([
      '--route',
      'a;b',
      '--gap',
      '20-50',
      '--fake=30',
      '--fence',
      '--no-setup',
    ]);
    expect(args).toMatchObject({
      route: 'a;b',
      gap: [20, 50],
      fake: 30,
      fence: true,
      setup: false,
      speed: 25,
      dwell: 12,
    });
    expect(() => parseArgs(['--nope'])).toThrow();
    expect(() => parseArgs(['--gap', '50-20'])).toThrow();
  });
});
