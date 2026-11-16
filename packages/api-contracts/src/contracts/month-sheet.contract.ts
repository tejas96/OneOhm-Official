import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { idSchema } from '../common/primitives';
import {
  monthQuerySchema,
  monthSheetPersonSchema,
  monthSheetSchema,
  monthUnlockInputSchema,
} from '../schemas/month-sheet.schema';
import { monthSchema } from '../schemas/monthly-review.schema';

const c = initContract();
const csvResponse = c.otherResponse({ contentType: 'text/csv', body: c.type<Blob>() });

/**
 * The month sheet for salary (Duty Day step 7). Built from attendance, leave, holidays,
 * travel and bonuses on every read while the month is open; frozen per person at lock.
 * HR (`people.manage`) and finance (`finance.approve_payments` / `finance.record_payments`)
 * see everyone with pay; a manager sees their direct reports, read-only, without pay. Anyone
 * else is refused (403). Only `people.manage` locks, unlocks and refreshes rows.
 * Never cached (`Cache-Control: private, no-store`).
 */
export const monthSheetContract = c.router({
  monthSheet: {
    method: 'GET',
    path: '/month-sheet',
    query: monthQuerySchema,
    responses: { 200: monthSheetSchema },
    summary: 'Everyone the caller may see, one row each: counts, money, flags; amber first.',
  },
  monthSheetExport: {
    method: 'GET',
    path: '/month-sheet/export',
    query: monthQuerySchema.extend({ format: z.literal('csv').default('csv') }),
    responses: { 200: csvResponse },
    summary:
      'The sheet as CSV for Excel (UTF-8 with BOM), one row per person; pay columns only for HR and finance.',
  },
  monthSheetPerson: {
    method: 'GET',
    path: '/month-sheet/:userId',
    pathParams: z.object({ userId: idSchema }),
    query: monthQuerySchema,
    responses: { 200: monthSheetPersonSchema },
    summary:
      'One person’s month day by day, with the breakdown, flags and the records behind them.',
  },
  lockMonth: {
    method: 'POST',
    path: '/month-sheet/lock',
    body: z.object({ month: monthSchema }),
    responses: { 200: monthSheetSchema },
    summary:
      'Freezes every row as it is now and tells each worker their month is final. Amber rows do not block.',
  },
  unlockMonth: {
    method: 'POST',
    path: '/month-sheet/unlock',
    body: monthUnlockInputSchema,
    responses: { 200: monthSheetSchema },
    summary: 'Opens a locked month again, with a reason kept in its history.',
  },
  refreshMonthRow: {
    method: 'POST',
    path: '/month-sheet/rows/:userId/refresh',
    pathParams: z.object({ userId: idSchema }),
    body: z.object({ month: monthSchema }),
    responses: { 200: monthSheetPersonSchema },
    summary:
      'Freezes one locked row again from the facts now (after a change after lock), or adds a person who qualifies now but is not in the locked sheet.',
  },
  myMonth: {
    method: 'GET',
    path: '/me/month',
    query: monthQuerySchema,
    responses: { 200: monthSheetPersonSchema },
    summary: 'The caller’s own month: the same numbers HR sees, day by day.',
  },
});
