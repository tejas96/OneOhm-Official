import type { Departure } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  holdersOf,
  reportingLines,
  roles,
  userRoles,
  users,
} from '@oneohm/database';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { notFound } from '../../../common/http/errors';
import { canManageProjects } from '../../projects/project-team-rules';
import { settlement, soleHolders } from './departure-settlement';
import { type OpenWork, openWork } from './departure-work';

export const countsOf = (work: OpenWork): Departure['counts'] => ({
  leads: work.leads.length,
  tasks: work.tasks.length,
  proposedTasks: work.proposedTasks.length,
  serviceRequests: work.serviceRequests.length,
  discomSteps: work.discomSteps.length,
  managedProjects: work.managedProjects.length,
  teamProjects: work.teamProjects.length,
  directReports: work.directReports.length,
  chats: work.chats.length,
  leaveApprovals: work.leaveApprovals.length,
  backupFor: work.backupFor.length,
  ownPendingLeave: work.ownPendingLeave.length,
  commissionRules: work.commissionRules.length,
});

/** The leaver's manager, when active and not a reseller only: the default person to hand over to. */
async function suggestedTarget(db: DatabaseExecutor, userId: string): Promise<string | null> {
  const [manager] = await db
    .select({ id: users.id })
    .from(reportingLines)
    .innerJoin(users, eq(users.id, reportingLines.managerUserId))
    .where(and(eq(reportingLines.userId, userId), eq(users.status, 'active')));
  if (!manager) return null;
  const [staffRole] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(and(eq(userRoles.userId, manager.id), ne(roles.kind, 'reseller')))
    .limit(1);
  return staffRole ? manager.id : null;
}

/** Every active person who can manage projects, the leaver left out: who may take their projects. */
async function projectManagers(db: DatabaseExecutor, leaverId: string): Promise<string[]> {
  const holders = (await holdersOf(db, 'projects.view_all')).filter((id) => id !== leaverId);
  const passes = await Promise.all(holders.map((id) => canManageProjects(db, id)));
  return holders.filter((_, index) => passes[index]);
}

/** The removal sheet's summary (spec Flow 5). Read only. */
export async function departureSummary(db: DatabaseExecutor, userId: string): Promise<Departure> {
  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!person) throw notFound('Person');
  const [work, owing, sole, suggested] = await Promise.all([
    openWork(db, userId),
    settlement(db, userId),
    soleHolders(db, userId),
    suggestedTarget(db, userId),
  ]);
  const managesProjects = work.managedProjects.length > 0;
  const projectManagerIds = managesProjects ? await projectManagers(db, userId) : [];
  const suggestedTargetId =
    managesProjects && suggested && !projectManagerIds.includes(suggested) ? null : suggested;
  return {
    counts: countsOf(work),
    settlement: owing,
    soleHolderOf: sole,
    suggestedTargetId,
    projectManagerIds,
  };
}
