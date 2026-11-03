import { and, eq, gte, lte } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { users } from './schema/identity.schema';
import { leaveRequests } from './schema/workforce.schema';

/**
 * People away on a day (YYYY-MM-DD, business calendar): approved leave that covers it,
 * both ends included, or marked on leave on their profile.
 */
export async function awayUserIds(db: DatabaseExecutor, date: string): Promise<Set<string>> {
  const onLeave = await db
    .select({ userId: leaveRequests.userId })
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.status, 'approved'),
        lte(leaveRequests.fromDate, date),
        gte(leaveRequests.toDate, date),
      ),
    );
  const marked = await db.select({ userId: users.id }).from(users).where(eq(users.onLeave, true));
  return new Set([...onLeave, ...marked].map((row) => row.userId));
}
