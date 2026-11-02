import { z } from 'zod';
import { calendarDateSchema, idSchema, instantSchema, paiseSchema } from '../common/primitives';
import { myMonthSchema } from './monthly-review.schema';
import { decisionStatusSchema, pointsEntrySchema } from './workforce.schema';

const userRef = z.object({ id: idSchema, fullName: z.string() });

/** A short notice to the team (PRD 4.1), shown on the field app's Today screen. */
export const announcementSchema = z.object({
  id: idSchema,
  title: z.string(),
  body: z.string(),
  /** Role keys it is for; empty means everyone. */
  audienceRoleKeys: z.array(z.string()),
  endsOn: calendarDateSchema.nullable(),
  createdBy: userRef.nullable(),
  createdAt: instantSchema,
  /** Showing now: not taken down and not past its last day. */
  active: z.boolean(),
});
export type Announcement = z.infer<typeof announcementSchema>;

export const announcementInputSchema = z.object({
  title: z.string().trim().min(3, 'Give it a short title.').max(80),
  body: z.string().trim().min(3, 'Say what it is about.').max(600),
  audienceRoleKeys: z.array(z.string().trim().min(1)).max(20).default([]),
  endsOn: calendarDateSchema.nullable().optional(),
});
export type AnnouncementInput = z.infer<typeof announcementInputSchema>;

export const payableStatusSchema = z.enum(['pending', 'approved', 'paid']);

/** A project bonus or incentive and each person's share (PRD 3.12, 4.7). */
export const bonusSchema = z.object({
  id: idSchema,
  project: z.object({ id: idSchema, code: z.string(), name: z.string() }).nullable(),
  reason: z.string(),
  totalPaise: paiseSchema,
  status: decisionStatusSchema,
  proposedBy: userRef.nullable(),
  decidedBy: userRef.nullable(),
  decidedAt: instantSchema.nullable(),
  decisionNote: z.string().nullable(),
  createdAt: instantSchema,
  shares: z.array(
    z.object({
      user: userRef,
      shares: z.number().int(),
      amountPaise: paiseSchema,
      /** The payable finance pays, once approved. */
      payableStatus: payableStatusSchema.nullable(),
      paidOn: calendarDateSchema.nullable(),
    }),
  ),
});
export type Bonus = z.infer<typeof bonusSchema>;

export const bonusInputSchema = z.object({
  projectId: idSchema.nullable().optional(),
  reason: z.string().trim().min(3, 'Say what it is for.').max(300),
  totalPaise: z.number().int().positive('Enter an amount.'),
  people: z
    .array(z.object({ userId: idSchema, shares: z.number().int().min(1).max(100) }))
    .min(1, 'Add at least one person.')
    .max(30),
});
export type BonusInput = z.infer<typeof bonusInputSchema>;

/** Open work against each person's limit, and the next four weeks (PRD 3.12). */
export const teamCapacitySchema = z.object({
  weeks: z.array(z.object({ from: calendarDateSchema, to: calendarDateSchema })),
  people: z.array(
    z.object({
      user: userRef,
      roles: z.array(z.string()),
      open: z.number().int(),
      overdue: z.number().int(),
      /** The person's own limit, else the company default; null means none. */
      limit: z.number().int().nullable(),
      state: z.enum(['ok', 'full', 'over']),
      dueByWeek: z.array(z.number().int()),
      leaveDaysByWeek: z.array(z.number().int()),
    }),
  ),
});
export type TeamCapacity = z.infer<typeof teamCapacitySchema>;

export const achievementSchema = z.object({
  key: z.enum([
    'on_time_streak',
    'on_time_25',
    'five_star',
    'five_star_5',
    'recognised',
    'points_500',
  ]),
  earned: z.boolean(),
  current: z.number().int(),
  target: z.number().int(),
});

/** The person's own points, achievements, customer feedback and money rewards (PRD 4.7). */
export const myRewardsSchema = z.object({
  /** This India month: points, rates and every missed line with its reason (spec 3.7). */
  month: myMonthSchema,
  points: z.object({
    total: z.number().int(),
    thisMonth: z.number().int(),
    history: z.array(pointsEntrySchema),
  }),
  achievements: z.array(achievementSchema),
  /** Customers' stars for this person on a finished stage, with any comment. */
  feedback: z.array(
    z.object({
      id: z.string(),
      projectCode: z.string(),
      stage: z.string(),
      stars: z.number().int(),
      comment: z.string().nullable(),
      createdAt: instantSchema,
    }),
  ),
  bonuses: z.array(
    z.object({
      id: idSchema,
      reason: z.string(),
      projectCode: z.string().nullable(),
      amountPaise: paiseSchema,
      status: decisionStatusSchema,
      payableStatus: payableStatusSchema.nullable(),
      paidOn: calendarDateSchema.nullable(),
      createdAt: instantSchema,
    }),
  ),
  /** Approved money not yet paid, and paid so far. */
  approvedPaise: paiseSchema,
  paidPaise: paiseSchema,
});
export type MyRewards = z.infer<typeof myRewardsSchema>;
