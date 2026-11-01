import { type DatabaseExecutor, reportingLines, roles, userRoles, users } from '@oneohm/database';
import { reportingLineProblem } from '@oneohm/domain';
import { and, eq, inArray } from 'drizzle-orm';
import { invalid } from '../../common/http/errors';

export interface ManagerRef {
  readonly id: string;
  readonly fullName: string;
  readonly active: boolean;
}

/** Each person's manager (PRD 3.12), for the people asked; missing means no one. */
export async function managersOf(
  db: DatabaseExecutor,
  ids: readonly string[],
): Promise<Map<string, ManagerRef>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      userId: reportingLines.userId,
      id: users.id,
      fullName: users.fullName,
      status: users.status,
    })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(inArray(reportingLines.userId, [...ids]));
  return new Map(
    rows.map((row) => [
      row.userId,
      { id: row.id, fullName: row.fullName, active: row.status === 'active' },
    ]),
  );
}

/** One person's manager, or null. */
export async function managerOf(db: DatabaseExecutor, userId: string): Promise<ManagerRef | null> {
  return (await managersOf(db, [userId])).get(userId) ?? null;
}

async function assertActiveStaff(db: DatabaseExecutor, userId: string): Promise<void> {
  const [person] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), eq(roles.kind, 'staff')))
    .where(and(eq(users.id, userId), eq(users.status, 'active')))
    .limit(1);
  if (!person)
    throw invalid('Pick an active team member as the manager.', {
      reportsToUserId: 'Not an active team member.',
    });
}

/**
 * Sets or clears who a person reports to. The manager is an active team member, and
 * the lines never go round in a circle. Undefined leaves it as it is.
 */
export async function saveReportingLine(
  db: DatabaseExecutor,
  userId: string,
  managerUserId: string | null | undefined,
  actorId: string,
): Promise<void> {
  if (managerUserId === undefined) return;
  if (managerUserId === null) {
    await db.delete(reportingLines).where(eq(reportingLines.userId, userId));
    return;
  }
  const lines = await db
    .select({ userId: reportingLines.userId, managerUserId: reportingLines.managerUserId })
    .from(reportingLines);
  const managers = new Map(lines.map((line) => [line.userId, line.managerUserId]));
  const problem = reportingLineProblem({ userId, managerUserId, managers });
  if (problem === 'self')
    throw invalid('Someone else is the manager.', { reportsToUserId: 'Not this person.' });
  if (problem === 'loop')
    throw invalid('The manager you picked already reports to this person.', {
      reportsToUserId: 'Already reports to this person, directly or through someone.',
    });
  await assertActiveStaff(db, managerUserId);
  await db
    .insert(reportingLines)
    .values({ userId, managerUserId, updatedByUserId: actorId })
    .onConflictDoUpdate({
      target: reportingLines.userId,
      set: { managerUserId, updatedByUserId: actorId, updatedAt: new Date() },
    });
}
