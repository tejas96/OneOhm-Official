import { monthRange } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { readBusinessCalendar } from './business-calendar';
import type { DatabaseExecutor } from './client';
import { roles, userRoles, users } from './schema/identity.schema';
import { reportingLines } from './schema/reporting.schema';

/** A person on the month sheet, with what the sheet shows beside their name. */
export interface MonthPerson {
  readonly id: string;
  readonly fullName: string;
  readonly employeeCode: string | null;
  readonly phone: string | null;
  readonly designation: string | null;
  readonly avatarSwatch: number;
  /** Business day they were added to the team. */
  readonly addedOn: string;
  readonly leftOn: string | null;
  readonly reportsTo: { readonly id: string; readonly fullName: string } | null;
}

/**
 * Staff who worked for the business at some point in the month: holding a staff role, added
 * by its last day, and not gone before its first day. Crew and resellers are not on the sheet.
 * Only `ids` when given; with `anyRole`, those people whatever they hold now (a locked
 * sheet keeps a person who lost their role since). Sorted by name.
 */
export async function monthPeople(
  db: DatabaseExecutor,
  month: string,
  ids?: readonly string[],
  options: { readonly anyRole?: boolean } = {},
): Promise<MonthPerson[]> {
  if (ids && ids.length === 0) return [];
  const { start, end } = monthRange(month);
  const { timeZone } = await readBusinessCalendar(db);
  const addedOn = sql<string>`(${users.createdAt} at time zone ${timeZone})::date::text`;
  const rows = await db
    .selectDistinct({
      id: users.id,
      fullName: users.fullName,
      employeeCode: users.employeeCode,
      phone: users.phoneE164,
      designation: users.designation,
      avatarSwatch: users.avatarSwatch,
      addedOn,
      leftOn: users.leftOn,
    })
    .from(users)
    .leftJoin(userRoles, eq(userRoles.userId, users.id))
    .leftJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(
      options.anyRole && ids
        ? inArray(users.id, [...ids])
        : and(
            eq(roles.kind, 'staff'),
            ids ? inArray(users.id, [...ids]) : undefined,
            sql`${addedOn} <= ${end}`,
            sql`(${users.leftOn} is null or ${users.leftOn} >= ${start}::date)`,
            sql`(${users.status} = 'active' or ${users.leftOn} is not null)`,
          ),
    )
    .orderBy(asc(users.fullName));
  if (rows.length === 0) return [];
  const lines = await db
    .select({ userId: reportingLines.userId, id: users.id, fullName: users.fullName })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(
      inArray(
        reportingLines.userId,
        rows.map((row) => row.id),
      ),
    );
  const managers = new Map(lines.map((line) => [line.userId, line]));
  return rows.map((row) => {
    const manager = managers.get(row.id);
    return { ...row, reportsTo: manager ? { id: manager.id, fullName: manager.fullName } : null };
  });
}

/** The people whose direct manager is `managerId` (any status; the month decides who counts). */
export async function directReportIds(db: DatabaseExecutor, managerId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: reportingLines.userId })
    .from(reportingLines)
    .where(eq(reportingLines.managerUserId, managerId));
  return rows.map((row) => row.userId);
}
