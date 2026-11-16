import type { payables } from '@oneohm/database';

/** The states of a vendor or crew bill. Only a voided travel claim's bill is ever cancelled. */
export type BillStatus = Exclude<(typeof payables.$inferSelect)['status'], 'cancelled'>;

/**
 * Narrows a status read from a vendor or crew query. Those queries never reach an employee's
 * bill, the only kind that is cancelled, so the value is always one of the three.
 */
export const billStatus = (status: (typeof payables.$inferSelect)['status']): BillStatus =>
  status as BillStatus;
