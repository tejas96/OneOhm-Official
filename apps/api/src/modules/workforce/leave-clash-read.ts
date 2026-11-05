import type { LeaveClashes } from '@oneohm/api-contracts';
import { type DatabaseExecutor, leaveRequests, users } from '@oneohm/database';
import { type ClashLeave, leaveClashes } from '@oneohm/domain';
import { and, gte, inArray, lte } from 'drizzle-orm';

interface Asked {
  readonly id?: string | undefined;
  readonly userId: string;
  readonly backupUserId: string | null;
  readonly fromDate: string;
  readonly toDate: string;
}

export const NO_CLASHES: LeaveClashes = { backupAway: [], covering: [] };

/**
 * Warnings for requests (never blocks): the backup is away on some of the days, or the
 * person asking is covering someone on some of them. Pending and approved leave count.
 */
export async function clashesFor(
  db: DatabaseExecutor,
  asked: readonly Asked[],
): Promise<Map<string, LeaveClashes>> {
  const result = new Map<string, LeaveClashes>();
  if (asked.length === 0) return result;
  const from = asked.reduce((min, item) => (item.fromDate < min ? item.fromDate : min), '9999');
  const to = asked.reduce((max, item) => (item.toDate > max ? item.toDate : max), '0000');
  const others: ClashLeave[] = await db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      backupUserId: leaveRequests.backupUserId,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      status: leaveRequests.status,
    })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.status, ['pending', 'approved']),
        lte(leaveRequests.fromDate, to),
        gte(leaveRequests.toDate, from),
      ),
    );
  const found = asked.map((item) => ({ item, clashes: leaveClashes(item, others) }));
  const ids = [
    ...new Set(found.flatMap(({ clashes }) => [...clashes.backupAway, ...clashes.covering])),
  ].map((leave) => leave.userId);
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const rows = await db
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, ids));
    for (const row of rows) names.set(row.id, row.fullName);
  }
  const present = (leave: ClashLeave) => ({
    user: { id: leave.userId, fullName: names.get(leave.userId) ?? '' },
    fromDate: leave.fromDate,
    toDate: leave.toDate,
    status: leave.status === 'approved' ? ('approved' as const) : ('pending' as const),
  });
  for (const { item, clashes } of found)
    result.set(item.id ?? '', {
      backupAway: clashes.backupAway.map(present),
      covering: clashes.covering.map(present),
    });
  return result;
}
