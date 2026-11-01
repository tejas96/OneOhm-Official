import type { LeaveImpact } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leaveRequests,
  projects,
  projectTasks,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { leaveHalfDays, suggestBackups, type WorkforcePolicy } from '@oneohm/domain';
import { and, eq, gte, inArray, lte, ne, sql } from 'drizzle-orm';
import { balancesOf, readLeave } from './workforce-read';

export interface LeaveWindow {
  leaveType: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
}

/** Open tasks of one person that fall due inside the window (what the leave affects). */
export function tasksInWindow(db: DatabaseExecutor, userId: string, window: LeaveWindow) {
  return db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      roleKey: projectTasks.roleKey,
      projectId: projectTasks.projectId,
      projectCode: projects.code,
      dueDate: projectTasks.dueDate,
      customerVisible: projectTasks.customerVisible,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        eq(projectTasks.assigneeUserId, userId),
        ne(projectTasks.status, 'completed'),
        lte(projectTasks.dueDate, window.toDate),
        gte(projectTasks.dueDate, window.fromDate),
      ),
    );
}

/**
 * Before applying (PRD 4.6, Flow E): days counted, what is left of that kind of leave,
 * the open tasks the leave touches and who could cover them.
 */
export async function leaveImpact(
  db: DatabaseExecutor,
  policy: WorkforcePolicy,
  userId: string,
  window: LeaveWindow,
): Promise<LeaveImpact> {
  const halfDays = leaveHalfDays({
    from: window.fromDate,
    to: window.toDate,
    halfDay: window.halfDay,
    weeklyOff: policy.weeklyOff,
  });
  const own = (await readLeave(db, policy, eq(leaveRequests.userId, userId))).map(
    (item) => item.row,
  );
  const balance = balancesOf(policy, own, window.fromDate.slice(0, 4)).find(
    (entry) => entry.leaveType === window.leaveType,
  );
  const left = balance
    ? balance.allowedHalfDays - balance.usedHalfDays - balance.pendingHalfDays
    : 0;
  const overlapsExisting = own.some(
    (row) =>
      (row.status === 'pending' || row.status === 'approved') &&
      row.fromDate <= window.toDate &&
      window.fromDate <= row.toDate,
  );
  const tasks = await tasksInWindow(db, userId, window);
  return {
    halfDays,
    balanceAfterHalfDays: left - halfDays,
    overlapsExisting,
    tasks: tasks.map(({ roleKey: _role, projectId: _project, ...task }) => task),
    backups: await backupsFor(db, userId, window, [...new Set(tasks.map((task) => task.roleKey))]),
  };
}

async function backupsFor(
  db: DatabaseExecutor,
  userId: string,
  window: LeaveWindow,
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
