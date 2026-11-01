import {
  type DatabaseExecutor,
  leaveRequests,
  projectTasks,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { suggestBackups } from '@oneohm/domain';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';

/**
 * Who could cover a leave (Flow E step 3): active staff not away in the window, those
 * holding the affected tasks' roles first, then the least busy.
 */
export async function backupsFor(
  db: DatabaseExecutor,
  userId: string,
  window: { fromDate: string; toDate: string },
  taskRoleKeys: string[],
) {
  const staff = await db
    .select({ id: users.id, fullName: users.fullName, roleKey: roles.key })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .where(and(eq(users.status, 'active'), ne(users.id, userId)));
  const ids = [...new Set(staff.map((row) => row.id))];
  if (ids.length === 0) return [];
  const [load, away] = await Promise.all([
    db
      .select({ userId: projectTasks.assigneeUserId, count: sql<number>`count(*)::int` })
      .from(projectTasks)
      .where(and(inArray(projectTasks.assigneeUserId, ids), ne(projectTasks.status, 'completed')))
      .groupBy(projectTasks.assigneeUserId),
    db
      .select({ userId: leaveRequests.userId })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, ids),
          inArray(leaveRequests.status, ['pending', 'approved']),
          lte(leaveRequests.fromDate, window.toDate),
          gte(leaveRequests.toDate, window.fromDate),
        ),
      ),
  ]);
  const candidates = ids.map((id) => ({
    userId: id,
    fullName: staff.find((row) => row.id === id)?.fullName ?? '',
    roleKeys: staff.filter((row) => row.id === id).map((row) => row.roleKey),
    openTasks: load.find((row) => row.userId === id)?.count ?? 0,
    onLeave: away.some((row) => row.userId === id),
  }));
  return suggestBackups(taskRoleKeys, candidates).map((person) => ({
    id: person.userId,
    fullName: person.fullName,
    openTasks: person.openTasks,
  }));
}
