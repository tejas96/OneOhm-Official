import { LIVE_STATES } from '@oneohm/domain';
import { z } from 'zod';
import { idSchema, instantSchema } from '../common/primitives';

/** What a person is doing now, on the manager's live map (Duty Day step 4). */
export const liveStateSchema = z.enum(LIVE_STATES);
export type LiveStateValue = z.infer<typeof liveStateSchema>;

export const liveTailPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  at: instantSchema,
});

/**
 * One person the caller looks after, today. Only today's duty day counts. Without current
 * consent or with location switched off (`location_off`) nothing comes from the route:
 * no position, tail, km, battery, network or mocked flag (null).
 */
export const livePersonSchema = z.object({
  person: z.object({
    id: idSchema,
    fullName: z.string(),
    /** Two letters for the round marker; there are no profile photos yet. */
    initials: z.string(),
    photoUrl: z.string().nullable(),
    avatarSwatch: z.number().int(),
    /** Designation, else the first role's name. */
    roleLabel: z.string().nullable(),
    /** For Call and WhatsApp. Everyone on this list is someone the caller may already call. */
    phone: z.string().nullable(),
  }),
  state: liveStateSchema,
  position: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
      accuracyM: z.number().nullable(),
      at: instantSchema,
      batteryPercent: z.number().int().nullable(),
      charging: z.boolean().nullable(),
      network: z.string().nullable(),
    })
    .nullable(),
  tail: z.array(liveTailPointSchema),
  today: z.object({
    /** Null when location is off: nothing is read from the route. */
    kmSoFar: z.number().nullable(),
    visitsDone: z.number().int(),
    visitsPlanned: z.number().int(),
    currentVisit: z.object({ label: z.string(), since: instantSchema }).nullable(),
    dutyStartedAt: instantSchema.nullable(),
  }),
  flags: z.object({ mockedToday: z.boolean().nullable() }),
  /** Open duty alerts about the person (any day): the red badge on the pin. */
  alerts: z.object({ open: z.number().int(), red: z.number().int() }),
});
export type LivePerson = z.infer<typeof livePersonSchema>;

export const liveTeamSchema = z.object({
  generatedAt: instantSchema,
  people: z.array(livePersonSchema),
});
export type LiveTeam = z.infer<typeof liveTeamSchema>;

export const liveSiteStatusSchema = z.enum(['planned', 'in_progress', 'done', 'late']);

/** A customer site with work today for someone the caller looks after. */
export const liveSiteSchema = z.object({
  id: idSchema,
  kind: z.enum(['survey', 'installation', 'inspection', 'service']),
  /** The job: the task's title or the service request's category. */
  label: z.string(),
  siteLabel: z.string(),
  customerName: z.string().nullable(),
  latitude: z.number(),
  longitude: z.number(),
  radiusM: z.number(),
  status: liveSiteStatusSchema,
  /** Start of today's planned visit, minutes after midnight (business time); null if not booked. */
  plannedStartMin: z.number().int().nullable(),
  assigneeIds: z.array(idSchema),
  /** For Open job: the project of a task; null for a service request. */
  projectId: idSchema.nullable(),
});
export type LiveSite = z.infer<typeof liveSiteSchema>;

export const liveOfficeSchema = z.object({
  id: idSchema,
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  radiusM: z.number(),
});

export const liveSitesSchema = z.object({
  sites: z.array(liveSiteSchema),
  offices: z.array(liveOfficeSchema),
});
export type LiveSites = z.infer<typeof liveSitesSchema>;
