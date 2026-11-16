import { z } from 'zod';

/** Site check-ins and travel reimbursement, as edited in Settings → Workforce (PRD 4.3). */
export const travelPolicySchema = z.object({
  farFromSiteM: z.number().int().min(50).max(5000),
  ratePaisePerKm: z.number().int().min(0).max(10_000),
  hoursMarginMinutes: z.number().int().min(0).max(240),
  pinTrustM: z.number().int().min(25).max(2000).default(100),
  /** The system makes the day's claim when the day ends. */
  autoClaim: z.boolean().default(true),
  /** A clean automatic claim is approved by the system the morning after the day (off until chosen). */
  autoApprove: z.boolean().default(false),
  /** More paid km than this always waits for a person. */
  autoApproveMaxKm: z.number().int().min(1).max(2000).default(150),
  /** More than this many paise always waits for a person. */
  autoApproveMaxPaise: z.number().int().min(0).max(10_000_000).default(150_000),
  /** Paid km are cut to the straight-line distance between stops times this. */
  routeCapRatio: z.number().min(1).max(5).default(1.6),
  /** The phone and the route check the person in and out at their sites by themselves. */
  autoSiteVisits: z.boolean().default(true),
  /** How close to a site, in metres, counts as being at it. */
  siteFenceM: z.number().int().min(50).max(1000).default(150),
  /** A duty start within this many km of the person's base or of an office is a known place. */
  baseStartMaxKm: z.number().min(1).max(50).default(5),
  /** Km taken off each day's paid km once, after the cap. */
  commuteDeductKm: z.number().min(0).max(50).default(0),
});
