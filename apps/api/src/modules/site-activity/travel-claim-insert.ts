import { attendanceDays, travelClaims } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { conflict } from '../../common/http/errors';
import type { Database } from '../../config/core.module';

type ClaimValues = typeof travelClaims.$inferInsert;

/**
 * Makes the claim with the attendance day locked, so a resume sent at the same moment
 * (say from a second phone) cannot reopen the day under the new claim. Resume locks the
 * same row first, then looks for a claim. Returns the new id, or null when one exists.
 */
export async function insertClaimLocked(
  db: Database,
  values: ClaimValues,
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ checkOutAt: attendanceDays.checkOutAt })
      .from(attendanceDays)
      .where(
        and(eq(attendanceDays.userId, values.userId), eq(attendanceDays.workDate, values.workDate)),
      )
      .for('update')
      .limit(1);
    if (locked && !locked.checkOutAt) throw conflict('End your day to claim.', 'day_open');
    const [row] = await tx
      .insert(travelClaims)
      .values(values)
      .onConflictDoNothing()
      .returning({ id: travelClaims.id });
    return row ?? null;
  });
}
