import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema } from '../common/primitives';

const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM, for example 09:30.');
const userRef = z.object({ id: idSchema, fullName: z.string() });
export const decisionStatusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled']);

/** Leave, attendance and points rules, as edited in Settings (PRD 7.2). */
export const workforcePolicySchema = z.object({
  leaveTypes: z
    .array(
      z.object({
        key: z
          .string()
          .trim()
          .regex(/^[a-z_]{2,30}$/, 'Use lowercase letters.'),
        label: z.string().trim().min(2).max(60),
        daysPerYear: z.number().int().min(0).max(366),
      }),
    )
    .min(1, 'Keep at least one kind of leave.'),
  weeklyOff: z.array(z.number().int().min(0).max(6)).max(6),
  attendance: z.object({
    dayStart: timeOfDay,
    dayEnd: timeOfDay,
    graceMinutes: z.number().int().min(0).max(240),
    captureLocation: z.boolean(),
    retentionDays: z.number().int().min(7).max(730),
    /** The first site check-in of the day also checks the person in (PRD 4.3). */
    autoCheckInFromSite: z.boolean().default(false),
    /** Location on or off for whole roles (role key → on), over `captureLocation`. */
    trackingByRole: z.record(z.string(), z.boolean()).default({}),
  }),
  points: z.object({
    onTimeTask: z.number().int().min(0).max(1000),
    firstTimeRight: z.number().int().min(0).max(1000).default(10),
    goodRating: z.number().int().min(0).max(5000),
    recognitionMax: z.number().int().min(1).max(10000),
    stageRating: z.number().int().min(0).max(5000).default(20),
  }),
  /** Site check-ins and travel reimbursement (PRD 4.3). */
  travel: z.object({
    farFromSiteM: z.number().int().min(50).max(5000),
    ratePaisePerKm: z.number().int().min(0).max(10_000),
    hoursMarginMinutes: z.number().int().min(0).max(240),
    pinTrustM: z.number().int().min(25).max(2000).default(100),
  }),
  /** Open tasks one person should carry (PRD 3.12); 0 means no limit. */
  capacity: z
    .object({ defaultOpenTaskLimit: z.number().int().min(0).max(500) })
    .default({ defaultOpenTaskLimit: 0 }),
});
export type WorkforcePolicyInput = z.infer<typeof workforcePolicySchema>;

export const workLocationSchema = z.object({
  id: idSchema,
  name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  radiusM: z.number().int(),
  active: z.boolean(),
});
export type WorkLocationRecord = z.infer<typeof workLocationSchema>;

export const workLocationInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusM: z.number().int().min(25).max(5000),
  active: z.boolean().default(true),
});

/** A reading from the phone; left out when the person has not agreed to share it. */
export const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100_000).nullable().optional(),
  /** Battery and connection at the reading, where the phone tells us (PRD 4.3). */
  batteryPercent: z.number().int().min(0).max(100).nullable().optional(),
  charging: z.boolean().nullable().optional(),
  network: z.enum(['wifi', 'cellular', 'none', 'other']).nullable().optional(),
});
export type PositionInput = z.infer<typeof positionSchema>;

export const attendanceDaySchema = z.object({
  workDate: calendarDateSchema,
  checkInAt: instantSchema,
  checkOutAt: instantSchema.nullable(),
  late: z.boolean(),
  /** The nearest authorised place at check-in, when location was shared. */
  place: z
    .object({ name: z.string(), inside: z.boolean(), distanceM: z.number().int() })
    .nullable(),
  checkOutInside: z.boolean().nullable(),
  corrected: z.boolean(),
  /** The phone's battery and connection at check-in, when it told us. */
  device: z
    .object({
      batteryPercent: z.number().int().nullable(),
      charging: z.boolean().nullable(),
      network: z.enum(['wifi', 'cellular', 'none', 'other']).nullable(),
    })
    .nullable()
    .optional(),
  /** Checked in by the day's first site check-in (PRD 4.3). */
  autoFromSite: z.boolean().optional(),
});
export type AttendanceDay = z.infer<typeof attendanceDaySchema>;

export const leaveRequestSchema = z.object({
  id: idSchema,
  user: userRef,
  leaveType: z.string(),
  leaveLabel: z.string(),
  fromDate: calendarDateSchema,
  toDate: calendarDateSchema,
  halfDay: z.boolean(),
  halfDays: z.number().int(),
  reason: z.string().nullable(),
  emergency: z.boolean(),
  backup: userRef.nullable(),
  handoverNote: z.string().nullable(),
  status: decisionStatusSchema,
  decidedBy: userRef.nullable(),
  decisionNote: z.string().nullable(),
  tasksHandedOver: z.number().int(),
  /** Emergency leave approved with work affected and nobody covering it. */
  handoverSkipped: z.boolean(),
  createdAt: instantSchema,
});
export type LeaveRequestRecord = z.infer<typeof leaveRequestSchema>;

export const leaveBalanceSchema = z.object({
  leaveType: z.string(),
  label: z.string(),
  allowedHalfDays: z.number().int(),
  usedHalfDays: z.number().int(),
  pendingHalfDays: z.number().int(),
});
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;

export const pointsEntrySchema = z.object({
  id: idSchema,
  user: userRef,
  points: z.number().int(),
  reason: z.string(),
  sourceType: z.enum([
    'task_on_time',
    'task_first_time',
    'customer_rating',
    'recognition',
    'stage_rating',
  ]),
  status: decisionStatusSchema,
  createdAt: instantSchema,
});
export type PointsEntry = z.infer<typeof pointsEntrySchema>;

/** Everything the field app's Today screen shows about the person's own day (PRD 4.1). */
export const myWorkdaySchema = z.object({
  today: attendanceDaySchema.nullable(),
  /** `answered` is false until the person has said yes or no once. */
  consent: z.object({
    given: z.boolean(),
    answered: z.boolean(),
    at: instantSchema.nullable(),
    /** The version of the words the person agreed to, and the one the app shows now. */
    version: z.number().int().nullable().optional(),
    currentVersion: z.number().int().optional(),
  }),
  /** Whether location is read right now: consent, policy and working hours (PRD 4.3). */
  tracking: z.enum(['on', 'no_consent', 'policy_off', 'outside_hours']).optional(),
  attendance: z.object({
    dayStart: z.string(),
    dayEnd: z.string(),
    captureLocation: z.boolean(),
    retentionDays: z.number().int(),
  }),
  balances: z.array(leaveBalanceSchema),
  leave: z.array(leaveRequestSchema),
  points: z.object({
    total: z.number().int(),
    thisMonth: z.number().int(),
    recent: z.array(pointsEntrySchema),
  }),
});
export type MyWorkday = z.infer<typeof myWorkdaySchema>;

export { type LeaveImpact, leaveImpactSchema } from './leave-impact.schema';

export const correctionSchema = z.object({
  id: idSchema,
  user: userRef,
  workDate: calendarDateSchema,
  checkInAt: instantSchema.nullable(),
  checkOutAt: instantSchema.nullable(),
  reason: z.string(),
  status: decisionStatusSchema,
  decisionNote: z.string().nullable(),
  createdAt: instantSchema,
});
export type AttendanceCorrection = z.infer<typeof correctionSchema>;

export const teamAttendanceRowSchema = z.object({
  user: userRef,
  day: attendanceDaySchema.nullable(),
  onLeave: z.string().nullable(),
});
export type TeamAttendanceRow = z.infer<typeof teamAttendanceRowSchema>;

export const pointsStandingSchema = z.object({
  user: userRef,
  total: z.number().int(),
  thisMonth: z.number().int(),
});
export type PointsStanding = z.infer<typeof pointsStandingSchema>;
