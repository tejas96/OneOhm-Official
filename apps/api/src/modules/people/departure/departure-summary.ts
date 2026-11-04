import type { Departure } from '@oneohm/api-contracts';
import { type DatabaseExecutor, reportingLines, roles, userRoles, users } from '@oneohm/database';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { notFound } from '../../../common/http/errors';
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

/** The removal sheet's summary (spec Flow 5). Read only. */
export async function departureSummary(db: DatabaseExecutor, userId: string): Promise<Departure> {
  const [person] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId));
  if (!person) throw notFound('Person');
  const [work, owing, sole, suggestedTargetId] = await Promise.all([
    openWork(db, userId),
    settlement(db, userId),
    soleHolders(db, userId),
    suggestedTarget(db, userId),
  ]);
  return { counts: countsOf(work), settlement: owing, soleHolderOf: sole, suggestedTargetId };
}
