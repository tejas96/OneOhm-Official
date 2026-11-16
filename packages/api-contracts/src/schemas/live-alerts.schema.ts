import { DUTY_ALERT_KINDS, DUTY_ALERT_SEVERITIES, DUTY_ALERT_SUBJECTS } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';

/**
 * One duty alert in the live map's feed (Duty Day step 5). Kinds: `not_checked_in`,
 * `fake_gps`, `route_gap`, `unknown_stop`, `visit_open_long`, `visit_missed`, `visit_doubtful`,
 * `job_left_unfinished`, `claim_waiting`, `claim_unpaid`. Each fires once per subject and day.
 */
export const dutyAlertSchema = z.object({
  id: idSchema,
  kind: z.enum(DUTY_ALERT_KINDS),
  /** `amber` = check this, `red` = act now. A route gap turns red over an hour. */
  severity: z.enum(DUTY_ALERT_SEVERITIES),
  /** The business day it is about. */
  day: calendarDateSchema,
  /** "Ravi Patil: unknown stop 50 min". */
  title: z.string(),
  /** The person it is about; `phone` for Call and WhatsApp. */
  person: z.object({ id: idSchema, fullName: z.string(), phone: z.string().nullable() }),
  /**
   * What it is about: `person` (their day; id = the person), `site_visit`, `task` or
   * `service_request` (the live map's site id: "Send nearest" opens it) or `travel_claim`.
   * `label` is the job, or null for the person's day.
   */
  subject: z.object({
    type: z.enum(DUTY_ALERT_SUBJECTS),
    id: idSchema,
    label: z.string().nullable(),
  }),
  /** Labels and numbers by kind (minutes, reasons, plannedStart, amountPaise…); never coordinates. */
  detail: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  createdAt: instantSchema,
  seenAt: instantSchema.nullable(),
  seenBy: z.object({ id: idSchema, fullName: z.string() }).nullable(),
  /** Set once closed (by a person, or by the system: a route gap whose points came back). */
  resolvedAt: instantSchema.nullable(),
  resolvedReason: z.string().nullable(),
});
export type DutyAlert = z.infer<typeof dutyAlertSchema>;

/** Open alerts about the people the caller looks after, newest first. */
export const liveAlertsSchema = z.object({ alerts: z.array(dutyAlertSchema) });
export type LiveAlerts = z.infer<typeof liveAlertsSchema>;

export const resolveAlertSchema = z.object({
  /** Why it is closed, in a few words; optional. */
  reason: z.string().trim().max(300).optional(),
});

/** A free person near a site, for "Send nearest". */
export const nearestPersonSchema = z.object({
  person: z.object({
    id: idSchema,
    fullName: z.string(),
    initials: z.string(),
    avatarSwatch: z.number().int(),
    roleLabel: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  /** Straight-line distance from their last point to the site. */
  distanceM: z.number().int(),
  /** Distance at 25 km/h, whole minutes (at least 1): an estimate, not a road route. */
  etaMinutes: z.number().int(),
  /** "about 12 min": always shown with "about". */
  etaLabel: z.string(),
  /** Where they were last seen, and when (under 20 minutes ago). */
  position: z.object({ latitude: z.number(), longitude: z.number(), at: instantSchema }),
});

/**
 * At most 5 people the caller looks after, on duty, free (not on a visit, not on leave),
 * location on, last seen under 20 minutes ago, nearest first. Empty when nobody is free.
 */
export const nearestPeopleSchema = z.object({
  siteId: idSchema,
  people: z.array(nearestPersonSchema),
});
export type NearestPeople = z.infer<typeof nearestPeopleSchema>;

export const assignSiteSchema = z.object({ userId: idSchema });
