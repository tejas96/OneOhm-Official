import { type DatabaseExecutor, employmentEvents } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';

/**
 * Remove from team: the last working day is kept as a departure, so the month sheet knows the
 * days after it are not employment even once the person comes back.
 */
export async function recordLeft(
  db: DatabaseExecutor,
  userId: string,
  lastWorkingDay: string,
  byUserId: string,
): Promise<void> {
  await db.insert(employmentEvents).values({ userId, kind: 'left', day: lastWorkingDay, byUserId });
}

/**
 * Add back to team: the first day back starts a new period. A departure from before departures
 * were kept (only the person's last working day was saved) is written first, so the gap stays.
 */
export async function recordRejoined(
  db: DatabaseExecutor,
  userId: string,
  leftOn: string | null,
  today: string,
  byUserId: string,
): Promise<void> {
  if (leftOn) {
    const [known] = await db
      .select({ id: employmentEvents.id })
      .from(employmentEvents)
      .where(
        and(
          eq(employmentEvents.userId, userId),
          eq(employmentEvents.kind, 'left'),
          eq(employmentEvents.day, leftOn),
        ),
      )
      .limit(1);
    if (!known) await recordLeft(db, userId, leftOn, byUserId);
  }
  await db.insert(employmentEvents).values({ userId, kind: 'rejoined', day: today, byUserId });
}
