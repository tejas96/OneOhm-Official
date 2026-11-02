import { type DatabaseExecutor, pointsEntries } from '@oneohm/database';
import { and, eq, sql } from 'drizzle-orm';

/** A person's lifetime approved points, summed in the database, never from a capped list. */
export async function lifetimePoints(db: DatabaseExecutor, userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${pointsEntries.points}), 0)::int` })
    .from(pointsEntries)
    .where(and(eq(pointsEntries.userId, userId), eq(pointsEntries.status, 'approved')));
  return row?.total ?? 0;
}
