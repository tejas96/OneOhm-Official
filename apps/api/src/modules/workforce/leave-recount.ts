import { type DatabaseExecutor, leaveRequests } from '@oneohm/database';
import { leaveHalfDays } from '@oneohm/domain';
import { and, eq, gte, inArray } from 'drizzle-orm';

/**
 * When the working week or the holidays change, leave still waiting or still to come is
 * counted again on the new calendar, so a new holiday gives the day back and a removed one
 * takes it. Leave already over keeps what it was counted at. Returns how many changed.
 */
export async function recountOpenLeave(
  db: DatabaseExecutor,
  calendar: { readonly weeklyOff: readonly number[]; readonly holidays: readonly string[] },
  today: string,
): Promise<number> {
  const open = await db
    .select({
      id: leaveRequests.id,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      halfDays: leaveRequests.halfDays,
    })
    .from(leaveRequests)
    .where(
      and(inArray(leaveRequests.status, ['pending', 'approved']), gte(leaveRequests.toDate, today)),
    );
  let changed = 0;
  for (const leave of open) {
    const halfDays = leaveHalfDays({
      from: leave.fromDate,
      to: leave.toDate,
      halfDay: leave.halfDay,
      weeklyOff: calendar.weeklyOff,
      holidays: calendar.holidays,
    });
    if (halfDays === leave.halfDays) continue;
    await db.update(leaveRequests).set({ halfDays }).where(eq(leaveRequests.id, leave.id));
    changed += 1;
  }
  return changed;
}
