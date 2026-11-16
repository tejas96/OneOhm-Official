import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';

/** One reading the phone recorded while its person was on duty (Duty Day step 1). */
export const dutyPointInputSchema = z.object({
  /** Made on the phone; sending the same id again is safe and counts as accepted. */
  id: idSchema,
  recordedAt: instantSchema,
  // Not range-checked here: a bad fix is rejected by id as `bad_coordinates`, so one
  // bad point never costs the other 199 their upload.
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: z.number().min(0).nullable().optional(),
  speedMps: z.number().nullable().optional(),
  headingDeg: z.number().nullable().optional(),
  altitudeM: z.number().nullable().optional(),
  /** Android's mock-location flag. */
  mocked: z.boolean().default(false),
  batteryPercent: z.number().int().min(0).max(100).nullable().optional(),
  charging: z.boolean().nullable().optional(),
  network: z.enum(['wifi', 'cellular', 'none', 'other']).nullable().optional(),
});
export type DutyPointInput = z.infer<typeof dutyPointInputSchema>;

export const dutyPointRejectionSchema = z.enum([
  'no_consent',
  'policy_off',
  'no_open_day',
  'outside_duty',
  'in_future',
  'bad_coordinates',
]);

export const dutyPointsBatchSchema = z.object({
  points: z.array(dutyPointInputSchema).min(1).max(200),
});

/** `accepted` includes duplicates; every point not accepted is listed with its reason. */
export const dutyPointsResultSchema = z.object({
  accepted: z.number().int(),
  rejected: z.array(z.object({ id: idSchema, reason: dutyPointRejectionSchema })),
});
export type DutyPointsResult = z.infer<typeof dutyPointsResultSchema>;

export const dutyRoutePointSchema = z.object({
  id: idSchema,
  recordedAt: instantSchema,
  latitude: z.number(),
  longitude: z.number(),
  accuracyM: z.number().nullable(),
  speedMps: z.number().nullable(),
  headingDeg: z.number().nullable(),
  altitudeM: z.number().nullable(),
  mocked: z.boolean(),
  batteryPercent: z.number().int().nullable(),
  charging: z.boolean().nullable(),
  network: z.string().nullable(),
});

/** A person's route for one business day, in time order, with the numbers read first. */
export const dutyRouteSchema = z.object({
  userId: idSchema,
  date: calendarDateSchema,
  points: z.array(dutyRoutePointSchema),
  summary: z.object({
    count: z.number().int(),
    firstAt: instantSchema.nullable(),
    lastAt: instantSchema.nullable(),
    mockedCount: z.number().int(),
    maxGapMinutes: z.number().int(),
  }),
});
export type DutyRoute = z.infer<typeof dutyRouteSchema>;
