import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { type Notice, notifyCover, notifyHolders } from './notify';
import { users } from './schema/identity.schema';
import { reportingLines } from './schema/reporting.schema';

/** The person's manager when they are still active; otherwise nobody. */
export async function activeManager(db: DatabaseExecutor, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id, status: users.status })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(eq(reportingLines.userId, userId))
    .limit(1);
  return row?.status === 'active' ? row.id : null;
}

/**
 * Tells the person's manager (or whoever covers for them) about their attendance, or the
 * people who approve corrections when there is no active manager. Saved in the caller's
 * transaction; the notice key keeps it to one alert.
 */
export async function tellAttendanceTeam(
  db: DatabaseExecutor,
  userId: string,
  notice: Notice,
): Promise<void> {
  const manager = await activeManager(db, userId);
  if (manager) await notifyCover(db, manager, 'leave.approve', notice);
  else await notifyHolders(db, 'leave.approve', notice, userId);
}
