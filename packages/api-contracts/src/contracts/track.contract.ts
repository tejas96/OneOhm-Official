import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { instantSchema } from '../common/primitives';
import { mapsConfigSchema } from './maps.contract';

const c = initContract();

const placeSchema = z.object({ latitude: z.number(), longitude: z.number() });

/**
 * The customer's "Track live" page (Duty Day step 6), opened from the "on the way" message with
 * no sign-in. `on_way`: the worker's latest usable position and the ETA. `arrived`: they checked
 * in at the site. `ended`: the visit is over, the day ended, or the link is older than 3 hours.
 * Only `on_way` carries the worker's position.
 */
export const trackViewSchema = z.object({
  state: z.enum(['on_way', 'arrived', 'ended']),
  /** The worker's first name. */
  workerName: z.string(),
  /** The customer's home, as their messages name it ("Sangli"). */
  homeLabel: z.string(),
  /** The home's saved pin; null when it has none. */
  home: placeSchema.nullable(),
  /** Null unless on the way. */
  worker: placeSchema.nullable(),
  /** About this many minutes away; null unless on the way. */
  minutes: z.number().int().nullable(),
  /** When the worker's position was read; null unless on the way. */
  updatedAt: instantSchema.nullable(),
  /** The customer's language, for the page's words. */
  language: z.enum(['en', 'mr', 'hi']),
  /** The map's browser key and Map ID (the same public key the staff maps use). */
  maps: mapsConfigSchema,
});
export type TrackView = z.infer<typeof trackViewSchema>;

export const trackContract = c.router({
  read: {
    method: 'GET',
    path: '/track/:token',
    pathParams: z.object({ token: z.string().min(10).max(600) }),
    responses: { 200: trackViewSchema, 404: z.object({ message: z.string() }) },
    summary: 'The live "on the way" page of a site visit, by its signed link; no sign-in.',
  },
});
