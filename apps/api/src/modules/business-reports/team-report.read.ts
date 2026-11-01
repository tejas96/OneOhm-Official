import {
  attendanceDays,
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  leaveRequests,
  projects,
  projectTasks,
  taskReviews,
  users,
} from '@oneohm/database';
import { leaveHalfDays, type WaitingParty } from '@oneohm/domain';
import { and, eq, gte, isNotNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { indiaDate, type ReportScope } from './report-scope';

/** A task with its assignee: finished in the period, or still open. */
export interface TeamTask {
  readonly userId: string;
  readonly party: WaitingParty;
  readonly dueDate: string;
  /** India date it finished inside the period; null while open. */
  readonly finishedOn: string | null;
  readonly open: boolean;
  /** Paused now, waiting on `party`. */
  readonly waiting: boolean;
  /** Times its work was sent back for correction (PRD 3.12 quality). */
  readonly reworks?: number;
}

export interface TeamPerson {
  readonly id: string;
  readonly name: string;
  readonly designation: string | null;
  readonly contractorId: string | null;
}

export interface TeamLeave {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly leaveType: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly halfDay: boolean;
  readonly halfDays: number;
}

export interface TeamAttendance {
  readonly userId: string;
  readonly present: number;
  readonly late: number;
}

/** Assigned tasks on the projects in view (manager filter dropped: Team is about people). */
export async function readTeamTasks(db: DatabaseExecutor, scope: ReportScope): Promise<TeamTask[]> {
  const rows = await db
    .select({
      userId: projectTasks.assigneeUserId,
      status: projectTasks.status,
      party: projectTasks.waitingParty,
      dueDate: projectTasks.dueDate,
      completedAt: projectTasks.completedAt,
      reworks: sql<number>`(select count(*)::int from ${taskReviews} where ${taskReviews.taskId} = ${projectTasks.id} and ${taskReviews.outcome} = 'returned')`,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(
      and(
        scope.projects,
        isNotNull(projectTasks.assigneeUserId),
        or(
          ne(projectTasks.status, 'completed'),
          and(gte(projectTasks.completedAt, scope.from), lt(projectTasks.completedAt, scope.until)),
        ),
      ),
    );
  return rows.flatMap((row) => {
    if (!row.userId) return [];
    const done = row.status === 'completed';
    if (done && !row.completedAt) return [];
    return [
      {
        userId: row.userId,
        party: row.party,
        dueDate: row.dueDate,
        finishedOn: done && row.completedAt ? indiaDate(row.completedAt) : null,
        open: !done,
        waiting: row.status === 'waiting',
        reworks: row.reworks,
      },
    ];
  });
}

/** Everyone, with the crew they belong to (crew members are contractor users). */
export async function readPeople(db: DatabaseExecutor): Promise<TeamPerson[]> {
  return db
    .select({
      id: users.id,
      name: users.fullName,
      designation: users.designation,
      contractorId: contractorMembers.contractorId,
    })
    .from(users)
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id));
}

export async function readCrews(db: DatabaseExecutor) {
  return db.select({ id: contractors.id, name: contractors.name }).from(contractors);
}

/** Approved leave that ends on or after the first day of the period. */
export async function readLeave(db: DatabaseExecutor, start: string): Promise<TeamLeave[]> {
  return db
    .select({
      id: leaveRequests.id,
      userId: leaveRequests.userId,
      name: users.fullName,
      leaveType: leaveRequests.leaveType,
      fromDate: leaveRequests.fromDate,
      toDate: leaveRequests.toDate,
      halfDay: leaveRequests.halfDay,
      halfDays: leaveRequests.halfDays,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(and(eq(leaveRequests.status, 'approved'), gte(leaveRequests.toDate, start)));
}

/** Days checked in and late check-ins per person, inside the period. */
export async function readAttendance(
  db: DatabaseExecutor,
  scope: ReportScope,
): Promise<TeamAttendance[]> {
  return db
    .select({
      userId: attendanceDays.userId,
      present: sql<number>`count(*)::int`,
      late: sql<number>`count(*) filter (where ${attendanceDays.late})::int`,
    })
    .from(attendanceDays)
    .where(
      and(
        gte(attendanceDays.workDate, scope.meta.range.start),
        lte(attendanceDays.workDate, scope.meta.range.end),
      ),
    )
    .groupBy(attendanceDays.userId);
}

/**
 * The half days of a leave that fall inside a window. A leave wholly inside keeps the
 * half days it was approved with; a leave across the edge counts its working days inside.
 */
export function leaveWithin(
  leave: Pick<TeamLeave, 'fromDate' | 'toDate' | 'halfDay' | 'halfDays'>,
  window: { readonly from: string; readonly to: string },
  weeklyOff: readonly number[],
): number {
  if (leave.toDate < window.from || leave.fromDate > window.to) return 0;
  if (leave.fromDate >= window.from && leave.toDate <= window.to) return leave.halfDays;
  return leaveHalfDays({
    from: leave.fromDate > window.from ? leave.fromDate : window.from,
    to: leave.toDate < window.to ? leave.toDate : window.to,
    halfDay: leave.halfDay,
    weeklyOff,
  });
}
