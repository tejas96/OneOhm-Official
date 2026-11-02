import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/** What the web needs to draw a map. `null` means no Google key: keep the typed inputs. */
export const mapsConfigSchema = z.object({ browserKey: z.string().nullable() });
export type MapsConfig = z.infer<typeof mapsConfigSchema>;

export const mapsContract = c.router({
  config: {
    method: 'GET',
    path: '/maps/config',
    responses: { 200: mapsConfigSchema },
    summary: 'The Google Maps browser key for signed-in staff, or null when none is set.',
  },
});
