import { initContract } from '@ts-rest/core';
import { z } from 'zod';

const c = initContract();

/**
 * What the web needs to draw a map. `browserKey` null means no Google key: keep the typed
 * inputs. `mapId` null means no vector map: the maps draw raster tiles (whole zoom steps only).
 */
export const mapsConfigSchema = z.object({
  browserKey: z.string().nullable(),
  mapId: z.string().nullable(),
});
export type MapsConfig = z.infer<typeof mapsConfigSchema>;

export const mapsContract = c.router({
  config: {
    method: 'GET',
    path: '/maps/config',
    responses: { 200: mapsConfigSchema },
    summary: 'The Google Maps browser key and Map ID for signed-in staff; null when not set.',
  },
});
