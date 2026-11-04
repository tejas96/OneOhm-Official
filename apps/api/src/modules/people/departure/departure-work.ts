import {
  changeRequestSteps,
  changeRequests,
  commissionRules,
  type DatabaseExecutor,
  leads,
  leaveManagerReviews,
  leaveRequests,
  projects,
  projectTasks,
  projectTeamMembers,
  reportingLines,
  serviceRequests,
  users,
  waConversations,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { and, eq, gte, inArray, ne, notInArray, or } from 'drizzle-orm';

/** Projects still running; tasks and teams on finished ones are history. */
const RUNNING = ['active', 'operational'] as const;

/** Everything a leaver still holds open, as ids. Handover (the next step) moves these. */
export interface OpenWork {
  readonly leads: readonly string[];
  readonly tasks: readonly string[];
  readonly proposedTasks: readonly string[];
  readonly serviceRequests: readonly string[];
  readonly discomSteps: readonly string[];
  readonly managedProjects: readonly string[];
  readonly teamProjects: readonly string[];
  readonly directReports: readonly string[];
  readonly chats: readonly string[];
  /** Leave requests waiting on this person's first look. */
  readonly leaveApprovals: readonly string[];
  /** Approved leave, not yet over, where this person is the backup. */
  readonly backupFor: readonly string[];
  readonly ownPendingLeave: readonly string[];
  /** The per-reseller commission rules that are still switched on. */
  readonly commissionRules: readonly string[];
}

const ids = (list: readonly { id: string }[]) => list.map((row) => row.id);

/**
 * Open rows only, for the whole of the person's time: unlike `affectedWork` (leave cover)
 * there is no date window. A finished project or a closed request is history, not work.
 */
export async function openWork(
  db: DatabaseExecutor,
  userId: string,
  today: string = todayIn(),
): Promise<OpenWork> {
  const [
    leadRows,
    taskRows,
    proposedRows,
    requestRows,
    stepRows,
    managedRows,
    teamRows,
    reportRows,
    chatRows,
    reviewRows,
    backupRows,
    leaveRows,
    ruleRows,
  ] = await Promise.all([
    db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.ownerUserId, userId), notInArray(leads.stage, ['won', 'lost']))),
    db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.assigneeUserId, userId),
          ne(projectTasks.status, 'completed'),
          inArray(projects.status, RUNNING),
        ),
      ),
    db
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.proposedUserId, userId),
          ne(projectTasks.status, 'completed'),
          inArray(projects.status, RUNNING),
        ),
      ),
    db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(
        and(eq(serviceRequests.assigneeUserId, userId), ne(serviceRequests.status, 'resolved')),
      ),
    db
      .select({ id: changeRequestSteps.id })
      .from(changeRequestSteps)
      .innerJoin(changeRequests, eq(changeRequests.id, changeRequestSteps.changeRequestId))
      .where(
        and(
          eq(changeRequestSteps.assigneeUserId, userId),
          ne(changeRequestSteps.status, 'completed'),
          eq(changeRequests.status, 'open'),
        ),
      ),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.managerUserId, userId), inArray(projects.status, RUNNING))),
    db
      .select({ id: projectTeamMembers.projectId })
      .from(projectTeamMembers)
      .innerJoin(projects, eq(projects.id, projectTeamMembers.projectId))
      .where(and(eq(projectTeamMembers.userId, userId), inArray(projects.status, RUNNING))),
    db
      .select({ id: reportingLines.userId })
      .from(reportingLines)
      .innerJoin(users, eq(users.id, reportingLines.userId))
      .where(and(eq(reportingLines.managerUserId, userId), eq(users.status, 'active'))),
    db
      .select({ id: waConversations.id })
      .from(waConversations)
      .where(
        or(eq(waConversations.assignedUserId, userId), eq(waConversations.handledByUserId, userId)),
      ),
    db
      .select({ id: leaveManagerReviews.leaveRequestId })
      .from(leaveManagerReviews)
      .innerJoin(leaveRequests, eq(leaveRequests.id, leaveManagerReviews.leaveRequestId))
      .where(
        and(
          eq(leaveManagerReviews.managerUserId, userId),
          eq(leaveManagerReviews.state, 'waiting'),
          eq(leaveRequests.status, 'pending'),
        ),
      ),
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(
        and(
          eq(leaveRequests.backupUserId, userId),
          eq(leaveRequests.status, 'approved'),
          gte(leaveRequests.toDate, today),
        ),
      ),
    db
      .select({ id: leaveRequests.id })
      .from(leaveRequests)
      .where(and(eq(leaveRequests.userId, userId), eq(leaveRequests.status, 'pending'))),
    db
      .select({ id: commissionRules.id })
      .from(commissionRules)
      .where(and(eq(commissionRules.resellerUserId, userId), eq(commissionRules.active, true))),
  ]);
  return {
    leads: ids(leadRows),
    tasks: ids(taskRows),
    proposedTasks: ids(proposedRows),
    serviceRequests: ids(requestRows),
    discomSteps: ids(stepRows),
    managedProjects: ids(managedRows),
    teamProjects: ids(teamRows),
    directReports: ids(reportRows),
    chats: ids(chatRows),
    leaveApprovals: ids(reviewRows),
    backupFor: ids(backupRows),
    ownPendingLeave: ids(leaveRows),
    commissionRules: ids(ruleRows),
  };
}
