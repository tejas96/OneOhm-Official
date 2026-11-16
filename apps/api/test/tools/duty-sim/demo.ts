import type { LatLng } from './geo';
import type { Path } from './path';

/** The acceptance suite's customer site in Sangli (same numbers as support/auto-visits). */
export const SITE: LatLng = { latitude: 16.8524, longitude: 74.5815 };

const at = (latitude: number, longitude: number): LatLng => ({ latitude, longitude });

/**
 * About 19 km of road around Sangli, hand-placed (no network): from a home in the west of the
 * town, through a few bends to the customer's site (about 4.5 km), then on through Miraj to the
 * east. At 25 km/h with a 12 minute stay that is a day of roughly 58 minutes.
 */
export function demoPath(): Path {
  const start = at(16.8265, 74.5455);
  const end = at(16.796, 74.7);
  const line: LatLng[] = [
    start,
    at(16.8302, 74.5495),
    at(16.8351, 74.5552),
    at(16.8372, 74.5618),
    at(16.8417, 74.5668),
    at(16.8445, 74.5731),
    at(16.8493, 74.5777),
    SITE,
    at(16.848, 74.59),
    at(16.842, 74.6),
    at(16.833, 74.615),
    at(16.828, 74.63),
    at(16.8222, 74.6457),
    at(16.815, 74.662),
    at(16.805, 74.68),
    end,
  ];
  return {
    line,
    waypoints: [start, SITE, end],
    siteIndex: 1,
    source: 'built-in demo path (Sangli)',
  };
}
