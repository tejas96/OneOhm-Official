import type { TeamAttendanceRow } from '@oneohm/api-contracts';
import { leaveRequests, roles, userRoles, users } from '@oneohm/database';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';
import type { Database } from '../../config/core.module';
import { loadPolicy } from './policy';
import { readDays } from './workforce-read';

/** Every active staff member on a day: checked in or not, or away on approved leave. */
export async function teamAttendance(db: Database, date: string): Promise<TeamAttendanceRow[]> {
  const people = await db
    .selectDistinct({ id: users.id, fullName: users.fullName })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .where(eq(users.status, 'active'))
    .orderBy(asc(users.fullName));
  const ids = people.map((person) => person.id);
  const [days, away] = await Promise.all([
    readDays(db, date, ids),
    ids.length
      ? db
          .select({ userId: leaveRequests.userId, leaveType: leaveRequests.leaveType })
          .from(leaveRequests)
          .where(
            and(
              inArray(leaveRequests.userId, ids),
              eq(leaveRequests.status, 'approved'),
              lte(leaveRequests.fromDate, date),
              gte(leaveRequests.toDate, date),
            ),
          )
      : Promise.resolve([]),
  ]);
  const policy = await loadPolicy(db);
  return people.map((person) => {
    const leave = away.find((row) => row.userId === person.id);
    return {
      user: person,
      day: days.get(person.id) ?? null,
      onLeave: leave
        ? (policy.leaveTypes.find((type) => type.key === leave.leaveType)?.label ?? leave.leaveType)
        : null,
    };
  });
}
