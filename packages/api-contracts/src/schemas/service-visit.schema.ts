import { SERVICE_NOTE_MAX, SERVICE_OUTCOMES } from '@oneohm/domain';
import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';
import { attachmentSchema } from './document.schema';
import { SERVICE_KINDS, SERVICE_STATUSES, ticketSlaSchema } from './service-desk.schema';
import { siteVisitSchema, trackingStatusSchema } from './site-activity.schema';
import { positionSchema } from './workforce.schema';

const userRef = z.object({ id: idSchema, fullName: z.string() });

/** Where the work is: the project's site, or the customer's first saved site. */
export const servicePlaceSchema = z.object({
  id: idSchema,
  label: z.string(),
  address: z.string(),
  city: z.string(),
  located: z.boolean(),
});

/**
 * A service request on the technician's list (PRD 5.5): who, where, what is wrong and
 * the times OneOhm promised the customer.
 */
export const serviceJobSchema = z.object({
  id: idSchema,
  kind: z.enum(SERVICE_KINDS),
  status: z.enum(SERVICE_STATUSES),
  categoryLabel: z.string(),
  description: z.string(),
  customer: z.object({ id: idSchema, name: z.string(), phone: z.string() }),
  place: servicePlaceSchema.nullable(),
  projectCode: z.string().nullable(),
  /** The planned day of a maintenance visit. */
  scheduledFor: calendarDateSchema.nullable(),
  responseDueAt: instantSchema.nullable(),
  resolutionDueAt: instantSchema.nullable(),
  respondedAt: instantSchema.nullable(),
  sla: ticketSlaSchema,
  /** The person is checked in at this request's site right now. */
  checkedIn: z.boolean(),
  createdAt: instantSchema,
});
export type ServiceJob = z.infer<typeof serviceJobSchema>;

/** What the technician wrote when they finished or handed the work back. */
export const serviceVisitReportSchema = z.object({
  id: idSchema,
  user: userRef,
  outcome: z.enum(SERVICE_OUTCOMES),
  found: z.string().nullable(),
  workDone: z.string().nullable(),
  reason: z.string().nullable(),
  createdAt: instantSchema,
});
export type ServiceVisitReport = z.infer<typeof serviceVisitReportSchema>;

/** A file the team added on the visit: a photo, a short video or a voice note. */
export const serviceFileSchema = attachmentSchema.extend({
  category: z.string(),
  uploadedBy: userRef.nullable(),
});
export type ServiceFile = z.infer<typeof serviceFileSchema>;

/** The field side of a request, as the desk reads it: visits, notes and evidence. */
export const serviceFieldWorkSchema = z.object({
  visits: z.array(siteVisitSchema),
  reports: z.array(serviceVisitReportSchema),
  files: z.array(serviceFileSchema),
});
export type ServiceFieldWork = z.infer<typeof serviceFieldWorkSchema>;

/** Everything the visit screen needs: the job, checking in and out, and the work so far. */
export const serviceVisitSchema = serviceJobSchema.extend({
  ...serviceFieldWorkSchema.shape,
  /** Photos the customer added when raising the request. */
  customerPhotos: z.array(z.object({ id: idSchema, name: z.string() })),
  /** The person's open visit anywhere (it may be another site's). */
  openVisit: siteVisitSchema.nullable(),
  tracking: trackingStatusSchema,
  farFromSiteM: z.number().int(),
  /** The person may check in, add evidence and finish: it is theirs and not resolved. */
  canWork: z.boolean(),
});
export type ServiceVisit = z.infer<typeof serviceVisitSchema>;

const note = z.string().trim().max(SERVICE_NOTE_MAX);

export const serviceFinishSchema = z.object({
  outcome: z.enum(SERVICE_OUTCOMES),
  found: note.nullable().optional(),
  workDone: note.nullable().optional(),
  reason: note.nullable().optional(),
  /** Read only with consent in working hours, to check out of the site. */
  position: positionSchema.nullable().optional(),
});
export type ServiceFinishInput = z.infer<typeof serviceFinishSchema>;
