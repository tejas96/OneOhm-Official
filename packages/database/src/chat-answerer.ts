import { pickAnswerer } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { users } from './schema/identity.schema';
import { leaveRequests } from './schema/workforce.schema';

/**
 * Who answers for this person today: themselves, or, when they are inactive or away,
 * the backup named on today's approved leave. Null means the desk picks it up.
 */
export async function answererFor(
  db: DatabaseExecutor,
  userId: string | null,
  today: string = todayIn(),
): Promise<string | null> {
  if (!userId) return null;
  const [user] = await db
    .select({ status: users.status, onLeave: users.onLeave })
    .from(users)
    .where(eq(users.id, userId));
  const [leave] = await db
    .select({ backup: leaveRequests.backupUserId })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.userId, userId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.fromDate, today),
        gte(leaveRequests.toDate, today),
      ),
    )
    .limit(1);
  const active = user?.status === 'active' && !user.onLeave && !leave;
  return pickAnswerer({ owner: userId, ownerActive: active, backupToday: leave?.backup ?? null });
}

/** The people this person covers today: approved leave that names them as the backup. */
export async function coveredBy(
  db: DatabaseExecutor,
  backupUserId: string,
  today: string = todayIn(),
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: leaveRequests.userId })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.backupUserId, backupUserId),
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.fromDate, today),
        gte(leaveRequests.toDate, today),
      ),
    );
  return rows.map((row) => row.userId);
}
