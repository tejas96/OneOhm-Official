import type {
  AttendanceDay,
  LeaveBalance,
  LeaveRequestRecord,
  PointsEntry,
} from '@oneohm/api-contracts';
import {
  attendanceDays,
  type DatabaseExecutor,
  leaveRequests,
  pointsEntries,
  users,
  workLocations,
} from '@oneohm/database';
import type { WorkforcePolicy } from '@oneohm/domain';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { conditionsFor } from './device-conditions';

type LeaveRow = typeof leaveRequests.$inferSelect;

/** Names for the people a set of rows mentions. */
async function namesOf(db: DatabaseExecutor, ids: readonly (string | null)[]) {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: users.id, fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, wanted));
  return new Map(rows.map((row) => [row.id, row.fullName]));
}

const ref = (names: Map<string, string>, id: string | null) =>
  id ? { id, fullName: names.get(id) ?? '' } : null;

export async function readLeave(
  db: DatabaseExecutor,
  policy: WorkforcePolicy,
  where?: SQL,
): Promise<LeaveRecordWithRow[]> {
  const rows = await db
    .select()
    .from(leaveRequests)
    .where(where)
    .orderBy(desc(leaveRequests.fromDate));
  const names = await namesOf(
    db,
    rows.flatMap((row) => [row.userId, row.backupUserId, row.decidedByUserId]),
  );
  return rows.map((row) => ({ row, record: presentLeave(row, names, policy) }));
}

export interface LeaveRecordWithRow {
  readonly row: LeaveRow;
  readonly record: LeaveRequestRecord;
}

function presentLeave(
  row: LeaveRow,
  names: Map<string, string>,
  policy: WorkforcePolicy,
): LeaveRequestRecord {
  return {
    id: row.id,
    user: { id: row.userId, fullName: names.get(row.userId) ?? '' },
    leaveType: row.leaveType,
    leaveLabel:
      policy.leaveTypes.find((type) => type.key === row.leaveType)?.label ?? row.leaveType,
    fromDate: row.fromDate,
    toDate: row.toDate,
    halfDay: row.halfDay,
    halfDays: row.halfDays,
    reason: row.reason,
    emergency: row.emergency,
    backup: ref(names, row.backupUserId),
    handoverNote: row.handoverNote,
    status: row.status,
    decidedBy: ref(names, row.decidedByUserId),
    decisionNote: row.decisionNote,
    tasksHandedOver: row.tasksHandedOver,
    handoverSkipped: row.handoverSkipped,
    clashes: { backupAway: [], covering: [] },
    createdAt: row.createdAt.toISOString(),
  };
}

/** Allowance, used (approved) and waiting (pending) per kind of leave, for one year. */
export function balancesOf(
  policy: WorkforcePolicy,
  rows: readonly LeaveRow[],
  year: string,
): LeaveBalance[] {
  const inYear = rows.filter((row) => row.fromDate.startsWith(year));
  const sum = (key: string, status: LeaveRow['status']) =>
    inYear
      .filter((row) => row.leaveType === key && row.status === status)
      .reduce((total, row) => total + row.halfDays, 0);
  return policy.leaveTypes.map((type) => ({
    leaveType: type.key,
    label: type.label,
    allowedHalfDays: type.daysPerYear * 2,
    usedHalfDays: sum(type.key, 'approved'),
    pendingHalfDays: sum(type.key, 'pending'),
  }));
}

export async function readPoints(
  db: DatabaseExecutor,
  where?: SQL,
  limit = 200,
): Promise<PointsEntry[]> {
  const rows = await db
    .select({ entry: pointsEntries, fullName: users.fullName })
    .from(pointsEntries)
    .innerJoin(users, eq(users.id, pointsEntries.userId))
    .where(where)
    .orderBy(desc(pointsEntries.createdAt))
    .limit(limit);
  return rows.map(({ entry, fullName }) => ({
    id: entry.id,
    user: { id: entry.userId, fullName },
    points: entry.points,
    reason: entry.reason,
    sourceType: entry.sourceType,
    status: entry.status,
    createdAt: entry.createdAt.toISOString(),
  }));
}

/** Attendance for some people on one day, by person. */
export async function readDays(
  db: DatabaseExecutor,
  workDate: string,
  userIds?: readonly string[],
): Promise<Map<string, AttendanceDay>> {
  const filter =
    userIds && userIds.length > 0
      ? and(eq(attendanceDays.workDate, workDate), inArray(attendanceDays.userId, [...userIds]))
      : eq(attendanceDays.workDate, workDate);
  const rows = await db
    .select({ day: attendanceDays, place: workLocations.name })
    .from(attendanceDays)
    .leftJoin(workLocations, eq(workLocations.id, attendanceDays.checkInLocationId))
    .where(filter);
  const devices = await conditionsFor(
    db,
    rows.map(({ day }) => day.id),
    'check_in',
  );
  return new Map(
    rows.map(({ day, place }) => [
      day.userId,
      {
        workDate: day.workDate,
        checkInAt: day.checkInAt.toISOString(),
        checkOutAt: day.checkOutAt?.toISOString() ?? null,
        late: day.late,
        place:
          place && day.checkInDistanceM !== null && day.checkInInside !== null
            ? { name: place, inside: day.checkInInside, distanceM: day.checkInDistanceM }
            : null,
        checkOutInside: day.checkOutInside,
        corrected: day.correctedAt !== null,
        device: devices.get(day.id) ?? null,
        autoFromSite: day.autoFromSite,
      },
    ]),
  );
}
