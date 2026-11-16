import { GAP_REASONS, STOP_PLACES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { visitProofReasonSchema, visitProofSchema } from './visit-proof.schema';

/**
 * A person's duty day as one ordered list (Duty Day step 5, `GET /people/:id/day`): the side
 * panel's day and the replay read this. Every segment has `startAt`, `endAt` and whole
 * `minutes`; `kind` says which of the four it is.
 */
const span = { startAt: instantSchema, endAt: instantSchema, minutes: z.number().int() };

/** Standing still 10 min or more within 100 m. `flagged`: an unknown stop over the setting (45 min). */
export const dutyStopSegmentSchema = z.object({
  kind: z.literal('stop'),
  ...span,
  centre: z.object({ latitude: z.number(), longitude: z.number() }),
  /** `office` (inside a work place), `site` (a customer site of that day) or `unknown`. */
  place: z.enum(STOP_PLACES),
  /** The office's name or the site's label; null for an unknown stop. */
  placeLabel: z.string().nullable(),
  flagged: z.boolean(),
});

/** Moving between the other segments; km along the route, like the day's km. */
export const dutyTravelSegmentSchema = z.object({
  kind: z.literal('travel'),
  ...span,
  km: z.number(),
});

/** A site visit; an open one runs to now (`open`) and has no proof yet. */
export const dutyVisitSegmentSchema = z.object({
  kind: z.literal('visit'),
  ...span,
  visitId: idSchema,
  /** The job: the task's title or the service request's category. */
  label: z.string(),
  /** The customer's site. */
  siteLabel: z.string().nullable(),
  open: z.boolean(),
  proof: visitProofSchema.nullable(),
  proofReasons: z.array(visitProofReasonSchema),
});

/**
 * No location for over 20 minutes on duty. `reason` is the likely cause from the last reading
 * before it: `low_battery`, `no_network`, `location_off`, or `unknown` (the app was probably
 * closed by the phone).
 */
export const dutyGapSegmentSchema = z.object({
  kind: z.literal('gap'),
  ...span,
  reason: z.enum(GAP_REASONS),
});

export const dutyDaySegmentSchema = z.discriminatedUnion('kind', [
  dutyStopSegmentSchema,
  dutyTravelSegmentSchema,
  dutyVisitSegmentSchema,
  dutyGapSegmentSchema,
]);
export type DutyDaySegment = z.infer<typeof dutyDaySegmentSchema>;

export const dutyDaySchema = z.object({
  userId: idSchema,
  date: calendarDateSchema,
  /** When duty started and ended; null when the person did not start duty that day. */
  duty: z
    .object({
      startedAt: instantSchema,
      /** Null while the day is open (the timeline runs to now). */
      endedAt: instantSchema.nullable(),
    })
    .nullable(),
  /**
   * Location on and consent current for the person now. Off: no route is read, so no stops,
   * travel km or points; visits and gaps still show.
   */
  locationOn: z.boolean(),
  /** In time order. Visits win over gaps, gaps over stops; the time between is travel. */
  segments: z.array(dutyDaySegmentSchema),
  totals: z.object({
    /** Km along the recorded route; null with location off. */
    routeKm: z.number().nullable(),
    /** Km paid for the day once it is closed and saved; null before that. */
    paidKm: z.number().nullable(),
    hoursOnDuty: z.number(),
    visits: z.number().int(),
    unknownStopMinutes: z.number().int(),
    gapMinutes: z.number().int(),
  }),
  /** Kept route points for the replay, oldest first, thinned evenly to at most 1500. */
  points: z.array(z.object({ at: instantSchema, latitude: z.number(), longitude: z.number() })),
});
export type DutyDay = z.infer<typeof dutyDaySchema>;
