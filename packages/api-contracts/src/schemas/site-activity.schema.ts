import { SITE_VISIT_KINDS } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { decisionStatusSchema } from './workforce.schema';

const userRef = z.object({ id: idSchema, fullName: z.string() });

export const siteVisitKindSchema = z.enum(SITE_VISIT_KINDS);

/**
 * Whether the phone's location is read right now (PRD 4.3): on only with consent, with
 * the policy on and within working hours. The app shows this so nothing is hidden.
 */
export const trackingStatusSchema = z.object({
  state: z.enum(['on', 'no_consent', 'policy_off', 'outside_hours']),
  /** The words the person must agree to, by version; asked again when it changes. */
  consentVersion: z.number().int(),
  consentGivenVersion: z.number().int().nullable(),
  consentAt: instantSchema.nullable(),
  /** False until the person has answered the current words once (yes or no). */
  answered: z.boolean(),
  hours: z.object({ from: z.string(), to: z.string() }),
  retentionDays: z.number().int(),
});
export type TrackingStatus = z.infer<typeof trackingStatusSchema>;

/** One check-in and check-out at a site. Coordinates are never sent back, only distances. */
export const siteVisitSchema = z.object({
  id: idSchema,
  user: userRef,
  kind: siteVisitKindSchema,
  taskId: idSchema.nullable(),
  /** What the visit was for: the task's title, or the service request's category. */
  taskTitle: z.string().nullable(),
  /** A service visit's request (PRD 5.5); null on task visits. */
  serviceRequestId: idSchema.nullable().optional(),
  projectId: idSchema.nullable(),
  projectCode: z.string().nullable(),
  siteLabel: z.string().nullable(),
  workDate: calendarDateSchema,
  checkInAt: instantSchema,
  checkOutAt: instantSchema.nullable(),
  /** Whole minutes on site; null while still there. */
  durationMinutes: z.number().int().nullable(),
  checkInDistanceM: z.number().int().nullable(),
  checkOutDistanceM: z.number().int().nullable(),
  /** Flagged for the manager; null when the distance is unknown. */
  farFromSite: z.boolean().nullable(),
  leftFarFromSite: z.boolean().nullable(),
  /** Why there is no distance: no location shared, or the site has no saved location. */
  locationNote: z.enum(['not_shared', 'site_unknown']).nullable(),
  locationCleared: z.boolean(),
});
export type SiteVisit = z.infer<typeof siteVisitSchema>;

/** Everything the task screen needs to check in and out at the site. */
export const taskSiteSchema = z.object({
  taskId: idSchema,
  /** Null when the task is office work: no check-in is offered. */
  kind: siteVisitKindSchema.nullable(),
  siteLabel: z.string().nullable(),
  siteLocated: z.boolean(),
  farFromSiteM: z.number().int(),
  /** The person's open visit anywhere (it may be another task's). */
  openVisit: siteVisitSchema.nullable(),
  visits: z.array(siteVisitSchema),
  tracking: trackingStatusSchema,
  /** The person may save their check-in spot as the site's location (none saved yet). */
  canSetSite: z.boolean(),
});
export type TaskSite = z.infer<typeof taskSiteSchema>;

export const travelLegSchema = z.object({
  fromLabel: z.string(),
  toLabel: z.string(),
  distanceM: z.number().int().nullable(),
});
export type TravelLegRecord = z.infer<typeof travelLegSchema>;

export const travelClaimSchema = z.object({
  id: idSchema,
  user: userRef,
  workDate: calendarDateSchema,
  distanceM: z.number().int(),
  ratePaisePerKm: z.number().int(),
  amountPaise: paiseSchema,
  visits: z.number().int(),
  legs: z.array(travelLegSchema),
  note: z.string().nullable(),
  status: decisionStatusSchema,
  /** Once approved: whether finance has paid it out yet. */
  paid: z.boolean(),
  paidOn: calendarDateSchema.nullable(),
  payableId: idSchema.nullable(),
  decidedBy: userRef.nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: instantSchema,
});
export type TravelClaim = z.infer<typeof travelClaimSchema>;

/** A person's travel on one day, built from their site check-ins, and its claim if made. */
export const travelDaySchema = z.object({
  workDate: calendarDateSchema,
  visits: z.array(siteVisitSchema),
  legs: z.array(travelLegSchema),
  distanceM: z.number().int(),
  ratePaisePerKm: z.number().int(),
  amountPaise: paiseSchema,
  /** Visits with no location: their legs are shown but not paid. */
  unlocated: z.number().int(),
  claim: travelClaimSchema.nullable(),
  /** A claim can be made: the day is over or today, has distance, and has no live claim. */
  claimable: z.boolean(),
});
export type TravelDay = z.infer<typeof travelDaySchema>;

/** Where and when a photo was taken, as shown on the document (no raw coordinates). */
export const photoGeotagSchema = z.object({
  capturedAt: instantSchema.nullable(),
  source: z.enum(['exif', 'device']),
  located: z.boolean(),
  distanceM: z.number().int().nullable(),
  farFromSite: z.boolean().nullable(),
});
export type PhotoGeotag = z.infer<typeof photoGeotagSchema>;

/**
 * Where a photo was taken, sent with the upload as form fields. Kept only when the
 * person has agreed to share location; otherwise just the time is kept.
 */
export const geotagFieldsSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  accuracyM: z.coerce.number().min(0).max(100_000).optional(),
  capturedAt: instantSchema.optional(),
  geoSource: z.enum(['exif', 'device']).optional(),
});
export type GeotagFields = z.infer<typeof geotagFieldsSchema>;
