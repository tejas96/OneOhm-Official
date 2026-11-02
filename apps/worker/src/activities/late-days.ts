import { type Database, leaveRequests } from '@oneohm/database';
import { idleDays, type LeaveSpan } from '@oneohm/domain';
import { addDays } from '@oneohm/shared';
import { and, eq, gte, inArray } from 'drizzle-orm';

/** Days past the due date, not counting the person's approved leave (spec 3.5). */
export function lateDays(dueDate: string, today: string, leave: readonly LeaveSpan[]): number {
  return dueDate >= today ? 0 : idleDays(dueDate, today, leave);
}

/** Whole days of approved leave per person, recent enough to matter for lateness. */
export async function leaveByPerson(
  db: Database,
  people: readonly string[],
  today: string,
): Promise<Map<string, LeaveSpan[]>> {
  const byPerson = new Map<string, LeaveSpan[]>();
  if (people.length === 0) return byPerson;
  const rows = await db
    .select({
      userId: leaveRequests.userId,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(
      and(
        inArray(leaveRequests.userId, [...people]),
        eq(leaveRequests.status, 'approved'),
        eq(leaveRequests.halfDay, false),
        gte(leaveRequests.toDate, addDays(today, -120)),
      ),
    );
  for (const row of rows)
    byPerson.set(row.userId, [...(byPerson.get(row.userId) ?? []), { from: row.from, to: row.to }]);
  return byPerson;
}
