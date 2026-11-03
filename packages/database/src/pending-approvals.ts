import { type PendingApproval, reviewersOf } from '@oneohm/domain';
import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm';
import type { DatabaseExecutor } from './client';
import { activeUserIds, liveOnly } from './manager-terms';
import { holdersOf } from './notify';
import { moneyApprovals } from './pending-approvals-money';
import { readableDay } from './readable-day';
import { users } from './schema/identity.schema';
import { projects, projectTasks } from './schema/projects.schema';
import { taskReviews } from './schema/task-reviews.schema';
import { attendanceCorrections, leaveRequests, pointsEntries } from './schema/workforce.schema';

/** One waiting approval with what a person needs to recognise it. */
export interface PendingApprovalRow extends PendingApproval {
  /** Plain words from the record itself: a task title, a person, a number. */
  readonly subject: string;
  readonly requesterName: string | null;
  readonly projectId: string | null;
  readonly projectCode: string | null;
}

const iso = (value: Date) => value.toISOString();

async function taskReviewRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      reviewer: projectTasks.reviewer,
      updatedAt: projectTasks.updatedAt,
      projectId: projects.id,
      code: projects.code,
      managerUserId: projects.managerUserId,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .where(eq(projectTasks.status, 'in_review'));
  if (rows.length === 0) return [];
  const reviews = await db
    .select({
      taskId: taskReviews.taskId,
      by: taskReviews.submittedByUserId,
      at: taskReviews.createdAt,
      name: users.fullName,
    })
    .from(taskReviews)
    .leftJoin(users, eq(users.id, taskReviews.submittedByUserId))
    .where(
      and(
        eq(taskReviews.outcome, 'pending'),
        inArray(
          taskReviews.taskId,
          rows.map((row) => row.id),
        ),
      ),
    );
  const approvers = await holdersOf(db, 'tasks.approve');
  const live = await activeUserIds(
    db,
    rows.map((row) => row.managerUserId),
  );
  return rows.map((row) => {
    const review = reviews.find((entry) => entry.taskId === row.id);
    const reviewer = row.reviewer === 'project_manager' ? 'project_manager' : 'approvers';
    const people = {
      reviewer,
      managerUserId: liveOnly(row.managerUserId, live),
      approvers,
    } as const;
    return {
      kind: 'task_review',
      id: row.id,
      requestedAt: iso(review?.at ?? row.updatedAt),
      requestedByUserId: review?.by ?? null,
      reviewerIds: reviewersOf(people, review?.by ?? null),
      amountPaise: null,
      subject: row.title,
      requesterName: review?.name ?? null,
      projectId: row.projectId,
      projectCode: row.code,
    };
  });
}

/** Critical tasks whose proposed person a manager still has to confirm (PRD 3.8). */
async function assigneeRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      id: projectTasks.id,
      title: projectTasks.title,
      at: projectTasks.updatedAt,
      projectId: projects.id,
      code: projects.code,
      proposed: users.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.proposedUserId))
    .where(
      and(
        isNotNull(projectTasks.proposedUserId),
        isNull(projectTasks.assigneeUserId),
        ne(projectTasks.status, 'completed'),
        inArray(projects.status, ['active', 'operational']),
      ),
    );
  return rows.map((row) => ({
    kind: 'assignee_confirm',
    id: row.id,
    requestedAt: iso(row.at),
    requestedByUserId: null,
    amountPaise: null,
    subject: row.title,
    requesterName: row.proposed,
    projectId: row.projectId,
    projectCode: row.code,
  }));
}

async function peopleRows(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const leave = await db
    .select({
      id: leaveRequests.id,
      at: leaveRequests.createdAt,
      userId: leaveRequests.userId,
      name: users.fullName,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(users.id, leaveRequests.userId))
    .where(eq(leaveRequests.status, 'pending'));
  const corrections = await db
    .select({
      id: attendanceCorrections.id,
      at: attendanceCorrections.createdAt,
      userId: attendanceCorrections.userId,
      name: users.fullName,
      day: attendanceCorrections.workDate,
    })
    .from(attendanceCorrections)
    .innerJoin(users, eq(users.id, attendanceCorrections.userId))
    .where(eq(attendanceCorrections.status, 'pending'));
  const points = await db
    .select({
      id: pointsEntries.id,
      at: pointsEntries.createdAt,
      userId: pointsEntries.userId,
      name: users.fullName,
      reason: pointsEntries.reason,
      points: pointsEntries.points,
    })
    .from(pointsEntries)
    .innerJoin(users, eq(users.id, pointsEntries.userId))
    .where(eq(pointsEntries.status, 'pending'));
  const base = { amountPaise: null, projectId: null, projectCode: null } as const;
  return [
    ...leave.map((row) => ({
      ...base,
      kind: 'leave' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.userId,
      subject:
        row.from === row.to
          ? readableDay(row.from)
          : `${readableDay(row.from)} – ${readableDay(row.to)}`,
      requesterName: row.name,
    })),
    ...corrections.map((row) => ({
      ...base,
      kind: 'attendance_correction' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.userId,
      subject: readableDay(row.day),
      requesterName: row.name,
    })),
    ...points.map((row) => ({
      ...base,
      kind: 'points' as const,
      id: row.id,
      requestedAt: iso(row.at),
      requestedByUserId: row.userId,
      subject: `${row.points} points · ${row.reason}`,
      requesterName: row.name,
    })),
  ];
}

/**
 * Everything waiting for someone's approval across OneOhm, oldest first (PRD 7.1).
 * Readers filter it: a person sees what they may decide; the worker, what waited too long.
 */
export async function listPendingApprovals(db: DatabaseExecutor): Promise<PendingApprovalRow[]> {
  const groups = await Promise.all([
    taskReviewRows(db),
    assigneeRows(db),
    peopleRows(db),
    moneyApprovals(db),
  ]);
  return groups.flat().sort((left, right) => left.requestedAt.localeCompare(right.requestedAt));
}
