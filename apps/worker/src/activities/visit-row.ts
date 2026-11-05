import type { Database } from '@oneohm/database';
import { visits as visitsTable } from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';

export type Row = typeof visitsTable.$inferSelect & {
  customer: string;
  phone: string;
  notify: boolean | null;
  /** The work itself is finished (task completed, request resolved). */
  finished: boolean;
};

/** Tells the owner once per visit (the flag is claimed first, so two ticks cannot both tell). */
export async function claimAlert(db: Database, row: Row, now: Date): Promise<boolean> {
  const claimed = await db
    .update(visitsTable)
    .set({ unconfirmedAlertAt: now })
    .where(and(eq(visitsTable.id, row.id), isNull(visitsTable.unconfirmedAlertAt)))
    .returning({ id: visitsTable.id });
  return claimed.length > 0;
}
