import {
  AUTO_SKIPS,
  CHECK_IN_SOURCES,
  CHECK_OUT_SOURCES,
  LEAVE_REASONS,
  PHONE_SOURCES,
  SITE_VISIT_KINDS,
} from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { customerSaidSchema, visitProofReasonSchema, visitProofSchema } from './visit-proof.schema';
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
  /** How it ended when not by the person's own check-out: a manager, or the end of their day. */
  closeKind: z.enum(['self', 'manager', 'day_end']).nullable().optional(),
  closeNote: z.string().nullable().optional(),
  /** How it began and ended: by a tap, the phone's site fence, the route, or the task finishing. */
  checkInSource: z.enum(CHECK_IN_SOURCES),
  checkOutSource: z.enum(CHECK_OUT_SOURCES).nullable(),
  /** Why the person left before the job was done, and when they said so. */
  leaveReason: z.enum(LEAVE_REASONS).nullable(),
  leaveReasonAt: instantSchema.nullable(),
  /** Whether the route proves the visit (see `visitProofSchema`); null while open. */
  proof: visitProofSchema.nullable(),
  proofReasons: z.array(visitProofReasonSchema),
  proofAt: instantSchema.nullable(),
  /** The customer's answer to "Was this visit done?"; null when not given. */
  customerSaid: customerSaidSchema.nullable().optional(),
});
export type SiteVisit = z.infer<typeof siteVisitSchema>;

/**
 * The person's latest visit that just ended, so the phone can ask "Job not finished, why?"
 * when the job is not done. Null when there is none in the last 12 hours.
 */
export const leftVisitSchema = z.object({
  visitId: idSchema,
  /** The work is finished, in review or the visit ended another way: there is nothing to explain. */
  done: z.boolean(),
  /** The person already said why. */
  reasonGiven: z.boolean(),
});
export type LeftVisit = z.infer<typeof leftVisitSchema>;

/** Why an automatic check-in did nothing; the phone ignores it. */
export const autoSkipSchema = z.enum(AUTO_SKIPS);

/** What a phone sends with a site check-in or check-out made by its own geofence. */
export const phoneSourceSchema = z.enum(PHONE_SOURCES);

/** One site where the person has work today, for the phone to fence (Duty Day step 3). */
export const dutySiteSchema = z.object({
  /** The task, or the service request when `kind` is service. */
  id: idSchema,
  kind: siteVisitKindSchema,
  label: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  radiusM: z.number().int(),
});
export type DutySiteRecord = z.infer<typeof dutySiteSchema>;

/** Empty when automatic visits are off in Settings: the phone then watches nothing. */
export const dutySitesSchema = z.array(dutySiteSchema);

/** Everything the task screen needs to check in and out at the site. */
export const taskSiteSchema = z.object({
  taskId: idSchema,
  /** Null when the task is office work: no check-in is offered. */
  kind: siteVisitKindSchema.nullable(),
  siteLabel: z.string().nullable(),
  /** The site's street address and city, what Navigate searches when no point is saved. */
  siteAddress: z.string().nullable(),
  siteLocated: z.boolean(),
  farFromSiteM: z.number().int(),
  /** The person's open visit anywhere (it may be another task's). */
  openVisit: siteVisitSchema.nullable(),
  visits: z.array(siteVisitSchema),
  tracking: trackingStatusSchema,
  /** The person may save their check-in spot as the site's location (none saved yet). */
  canSetSite: z.boolean(),
  /** The site's saved point, when it has one. */
  sitePoint: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
  /** The saved point waits for the office to confirm it (pin far from the worker or unread). */
  siteFlagged: z.boolean(),
  /** The person has an open visit on this task, so may pin the roof on the map. */
  canPinSite: z.boolean(),
  justLeft: leftVisitSchema.nullable(),
  /** Set when an automatic check-in was ignored, with the reason; the visit was not made. */
  autoSkipped: autoSkipSchema.nullable().optional(),
});
export type TaskSite = z.infer<typeof taskSiteSchema>;

export const travelLegSchema = z.object({
  fromLabel: z.string(),
  toLabel: z.string(),
  distanceM: z.number().int().nullable(),
});
export type TravelLegRecord = z.infer<typeof travelLegSchema>;

/** How a day's km were worked out (Duty Day step 2); `distanceM` everywhere is `paidM`. */
const travelKmShape = {
  /** Metres along the recorded route; 0 without one. */
  routeM: z.number().int(),
  /** Metres of the straight lines between the day's stops. */
  straightM: z.number().int(),
  /** What is paid: the route within the cap, or the straight line when there is no route. */
  paidM: z.number().int(),
  method: z.enum(['route', 'straight']),
  /** The route was longer than the cap, so the paid km were cut to it. */
  capApplied: z.boolean(),
  /** Metres taken off the paid km for the commute, once a day, after the cap. */
  commuteDeductM: z.number().int(),
  gapCount: z.number().int(),
  gapMinutes: z.number().int(),
  mockedCount: z.number().int(),
};

/** Who made and who decided a claim: the system acts on a clean day (Duty Day step 2). */
const travelAutoShape = {
  /** The system made the claim for the person when the day closed. */
  autoMade: z.boolean(),
  /** The system approved it at once: a clean day. */
  autoApproved: z.boolean(),
  /** Why an automatic claim waits for a person: codes such as route_gap, fake_gps, cap_applied. */
  reviewReasons: z.array(z.string()),
};

export const travelClaimSchema = z.object({
  ...travelKmShape,
  ...travelAutoShape,
  id: idSchema,
  user: userRef,
  workDate: calendarDateSchema,
  distanceM: z.number().int(),
  ratePaisePerKm: z.number().int(),
  amountPaise: paiseSchema,
  visits: z.number().int(),
  legs: z.array(travelLegSchema),
  /** The project the travel was for: its cost counts in that project's profitability. */
  project: z.object({ id: idSchema, code: z.string() }).nullable(),
  note: z.string().nullable(),
  status: decisionStatusSchema,
  /** Once approved: whether finance has paid it out yet. */
  paid: z.boolean(),
  paidOn: calendarDateSchema.nullable(),
  payableId: idSchema.nullable(),
  decidedBy: userRef.nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  /** Voided after approval (status is then cancelled): when, and the reason given. */
  voidedAt: instantSchema.nullable(),
  /** The system took the claim back when the person reopened the day: status is `cancelled`. */
  withdrawn: z.boolean(),
  voidReason: z.string().nullable(),
  /** Whether the person looking may decide it (manager, HR or finance; never the claimant). */
  canDecide: z.boolean(),
  /** Whether the person looking may void it once approved (finance or HR only). */
  canVoid: z.boolean(),
  createdAt: instantSchema,
});
export type TravelClaim = z.infer<typeof travelClaimSchema>;

/** A person's travel on one day, built from their site check-ins, and its claim if made. */
export const travelDaySchema = z.object({
  ...travelKmShape,
  ...travelAutoShape,
  workDate: calendarDateSchema,
  visits: z.array(siteVisitSchema),
  legs: z.array(travelLegSchema),
  distanceM: z.number().int(),
  ratePaisePerKm: z.number().int(),
  amountPaise: paiseSchema,
  /** Visits with no location: their legs are shown but not paid. */
  unlocated: z.number().int(),
  claim: travelClaimSchema.nullable(),
  /** A claim can be made: the day is closed, has distance, and has no live claim. */
  claimable: z.boolean(),
  /** The person's day has ended (End duty, the night job or a correction): only then is it claimed. */
  closed: z.boolean(),
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
