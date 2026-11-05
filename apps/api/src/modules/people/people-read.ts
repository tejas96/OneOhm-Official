import type { Person } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  leaveRequests,
  projectTasks,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import type { Environment } from '../../config/environment';
import { inviteDeliveries, inviteTextFor, roleKindsByUser } from './person-invite';
import { skillsOf } from './person-skills';
import { workOf } from './person-work';
import { managersOf } from './reporting-line';

const reportsTo = (manager: { id: string; fullName: string } | undefined) =>
  manager ? { id: manager.id, fullName: manager.fullName } : null;

/**
 * Everyone with their roles, skills, open tasks against their limit, and whether they
 * are away today: marked by hand, or on approved leave (PRD 3.12).
 */
export async function readPeople(
  db: DatabaseExecutor,
  env: Pick<Environment, 'STAFF_INVITES' | 'FIELD_APP_URL' | 'WEB_BASE_URL'>,
): Promise<Person[]> {
  const rows = await db.select().from(users).orderBy(asc(users.fullName));
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) return [];
  const today = todayIn();
  const [roleRows, loads, away, held, work, managers, deliveries, kinds] = await Promise.all([
    db
      .select({
        userId: userRoles.userId,
        id: roles.id,
        key: roles.key,
        name: roles.name,
        kind: roles.kind,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, ids)),
    db
      .select({ userId: projectTasks.assigneeUserId, open: sql<number>`count(*)::int` })
      .from(projectTasks)
      .where(and(inArray(projectTasks.assigneeUserId, ids), ne(projectTasks.status, 'completed')))
      .groupBy(projectTasks.assigneeUserId),
    db
      .select({
        userId: leaveRequests.userId,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
      })
      .from(leaveRequests)
      .where(
        and(
          inArray(leaveRequests.userId, ids),
          eq(leaveRequests.status, 'approved'),
          gte(leaveRequests.toDate, today),
        ),
      ),
    skillsOf(db, ids),
    workOf(db, ids),
    managersOf(db, ids),
    inviteDeliveries(db, ids),
    roleKindsByUser(db, ids),
  ]);
  const awayIds = new Set(
    away.filter((row) => row.fromDate <= today && row.toDate >= today).map((row) => row.userId),
  );
  return rows.map((row) => {
    const open = loads.find((load) => load.userId === row.id)?.open ?? 0;
    return {
      id: row.id,
      fullName: row.fullName,
      email: row.email,
      phone: row.phoneE164,
      employeeCode: row.employeeCode,
      designation: row.designation,
      status: row.status,
      onLeave: row.onLeave || awayIds.has(row.id),
      leaveRanges: away
        .filter((leave) => leave.userId === row.id)
        .map(({ fromDate, toDate }) => ({ fromDate, toDate })),
      roles: roleRows
        .filter((role) => role.userId === row.id)
        .map(({ userId: _ignored, ...role }) => role),
      skills: held.get(row.id) ?? [],
      openTasks: open,
      ...work(row.id, open),
      reportsTo: reportsTo(managers.get(row.id)),
      invite: row.lastActiveAt ? ('signed_in' as const) : ('not_signed_in' as const),
      inviteDelivery: deliveries.get(row.id) ?? null,
      inviteText: row.lastActiveAt
        ? null
        : inviteTextFor({ ...row, roleKinds: kinds.get(row.id) ?? [] }, env),
      invitesOn: env.STAFF_INVITES === 'on',
      leftOn: row.leftOn,
    };
  });
}
