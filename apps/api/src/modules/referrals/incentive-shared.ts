import type { IncentiveFilter } from '@oneohm/api-contracts';
import { type Column, eq, inArray, type SQL } from 'drizzle-orm';

/** The rows a status filter keeps: "open" is everything still to approve or pay. */
export function statusCondition(column: Column, filter: IncentiveFilter): SQL | undefined {
  if (filter === 'all') return undefined;
  if (filter === 'open') return inArray(column, ['pending', 'approved']);
  return eq(column, filter);
}

const OUT = ['cash', 'cheque', 'bank_transfer', 'upi'] as const;

/** Payouts go out by cash, cheque, bank transfer or UPI. */
export function outMethod(method: string | null): (typeof OUT)[number] | null {
  return OUT.find((value) => value === method) ?? null;
}
