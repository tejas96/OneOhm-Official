import { z } from 'zod';

/** The month sheet's rules inside the attendance policy (Settings → Workforce). */
export const monthSheetPolicyFields = {
  /** A worked day shorter than this many hours is a half day. */
  halfDayHours: z.number().min(1).max(12).default(4),
  /** Holidays and weekly offs are paid only in a week with some work or paid leave. */
  offsNeedWorkInWeek: z.boolean().default(true),
  /** Every `every` late marks take off half a day; 0 = off. */
  lateDeduction: z.object({ every: z.number().int().min(0).max(31) }).default({ every: 0 }),
};
