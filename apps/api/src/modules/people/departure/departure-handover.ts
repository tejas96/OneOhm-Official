import {
  changeRequestSteps,
  changeRequests,
  leadActivities,
  leads,
  notify,
  projectActivities,
  projects,
  projectTasks,
  projectTeamMembers,
  serviceRequests,
  type Transaction,
  waConversations,
} from '@oneohm/database';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  moveBackups,
  moveLeaveReviews,
  moveReports,
  type PersonRef,
} from './departure-handover-people';
import { DEPARTURE_NOTICES, handoverNote, type Moved, movedTotal } from './departure-notices';
import type { OpenWork } from './departure-work';

/** Leads, tasks, requests, DISCOM steps, managed projects and chats get the new owner. */
async function moveOwnership(tx: Transaction, from: string, to: string, work: OpenWork) {
  const now = new Date();
  if (work.leads.length > 0)
    await tx
      .update(leads)
      .set({ ownerUserId: to, version: sql`${leads.version} + 1`, updatedAt: now })
      .where(inArray(leads.id, [...work.leads]));
  if (work.tasks.length > 0)
    await tx
      .update(projectTasks)
      .set({ assigneeUserId: to, version: sql`${projectTasks.version} + 1`, updatedAt: now })
      .where(inArray(projectTasks.id, [...work.tasks]));
  if (work.proposedTasks.length > 0)
    await tx
      .update(projectTasks)
      .set({ proposedUserId: to, version: sql`${projectTasks.version} + 1`, updatedAt: now })
      .where(inArray(projectTasks.id, [...work.proposedTasks]));
  if (work.serviceRequests.length > 0)
    await tx
      .update(serviceRequests)
      .set({ assigneeUserId: to, updatedAt: now })
      .where(inArray(serviceRequests.id, [...work.serviceRequests]));
  if (work.discomSteps.length > 0)
    await tx
      .update(changeRequestSteps)
      .set({ assigneeUserId: to, updatedAt: now })
      .where(inArray(changeRequestSteps.id, [...work.discomSteps]));
  if (work.managedProjects.length > 0)
    await tx
      .update(projects)
      .set({ managerUserId: to, version: sql`${projects.version} + 1`, updatedAt: now })
      .where(inArray(projects.id, [...work.managedProjects]));
  if (work.chats.length > 0) {
    // The assistant answers with `assigned ?? handled by`, so both move (spec "WhatsApp chats").
    const chats = inArray(waConversations.id, [...work.chats]);
    await tx
      .update(waConversations)
      .set({ assignedUserId: to, updatedAt: now })
      .where(and(chats, eq(waConversations.assignedUserId, from)));
    await tx
      .update(waConversations)
      .set({ handledByUserId: to, updatedAt: now })
      .where(and(chats, eq(waConversations.handledByUserId, from)));
  }
}

/** The leaver's team places go to the target, unless the target is already on that team. */
async function swapTeams(tx: Transaction, from: string, to: string, projectIds: readonly string[]) {
  if (projectIds.length === 0) return;
  await tx
    .insert(projectTeamMembers)
    .values(projectIds.map((projectId) => ({ projectId, userId: to })))
    .onConflictDoNothing();
  await tx
    .delete(projectTeamMembers)
    .where(
      and(
        eq(projectTeamMembers.userId, from),
        inArray(projectTeamMembers.projectId, [...projectIds]),
      ),
    );
}

/** Every running project the leaver's work touched. */
async function touchedProjects(tx: Transaction, work: OpenWork): Promise<string[]> {
  const found = new Set([...work.managedProjects, ...work.teamProjects]);
  const taskIds = [...work.tasks, ...work.proposedTasks];
  const [tasks, requests, steps] = await Promise.all([
    taskIds.length === 0
      ? []
      : tx
          .select({ projectId: projectTasks.projectId })
          .from(projectTasks)
          .where(inArray(projectTasks.id, taskIds)),
    work.serviceRequests.length === 0
      ? []
      : tx
          .select({ projectId: serviceRequests.projectId })
          .from(serviceRequests)
          .where(
            and(
              inArray(serviceRequests.id, [...work.serviceRequests]),
              isNotNull(serviceRequests.projectId),
            ),
          ),
    work.discomSteps.length === 0
      ? []
      : tx
          .select({ projectId: changeRequests.projectId })
          .from(changeRequestSteps)
          .innerJoin(changeRequests, eq(changeRequests.id, changeRequestSteps.changeRequestId))
          .where(
            and(
              inArray(changeRequestSteps.id, [...work.discomSteps]),
              isNotNull(changeRequests.projectId),
            ),
          ),
  ]);
  for (const row of [...tasks, ...requests, ...steps]) if (row.projectId) found.add(row.projectId);
  return [...found];
}

/** A note on each project and lead that changed hands. */
async function writeNotes(tx: Transaction, actorId: string, leaver: PersonRef, work: OpenWork) {
  const note = handoverNote(leaver.fullName);
  const projectIds = await touchedProjects(tx, work);
  if (projectIds.length > 0)
    await tx.insert(projectActivities).values(
      projectIds.map((projectId) => ({
        projectId,
        kind: 'task_handover',
        message: note,
        userId: actorId,
      })),
    );
  if (work.leads.length > 0)
    await tx.insert(leadActivities).values(
      work.leads.map((leadId) => ({
        leadId,
        kind: 'note' as const,
        note,
        userId: actorId,
        internal: true,
      })),
    );
}

/**
 * Removal (spec Flow 5 step 1): all of the leaver's open work goes to one person, with a
 * note on each project and lead, and that person gets one notice. Returns how much moved.
 */
export async function handOver(
  tx: Transaction,
  actorId: string,
  leaver: PersonRef,
  target: PersonRef,
  work: OpenWork,
): Promise<number> {
  await moveOwnership(tx, leaver.id, target.id, work);
  await swapTeams(tx, leaver.id, target.id, work.teamProjects);
  const reportMoves = await moveReports(tx, actorId, leaver.id, target.id, work.directReports);
  const reviews = await moveLeaveReviews(tx, target.id, work.leaveApprovals, reportMoves);
  const backups = await moveBackups(tx, leaver, target, work.backupFor);
  await writeNotes(tx, actorId, leaver, work);
  const moved: Moved = {
    leads: work.leads.length,
    // A task both assigned and proposed to the leaver counts once.
    tasks: new Set([...work.tasks, ...work.proposedTasks]).size,
    serviceRequests: work.serviceRequests.length,
    discomSteps: work.discomSteps.length,
    managedProjects: work.managedProjects.length,
    teamProjects: work.teamProjects.length,
    directReports: [...reportMoves.values()].filter((id) => id === target.id).length,
    chats: work.chats.length,
    leaveApprovals: reviews,
    backupFor: backups,
  };
  const total = movedTotal(moved);
  if (total > 0)
    await notify(
      tx,
      { userId: target.id },
      DEPARTURE_NOTICES.covering(leaver.id, leaver.fullName, moved, new Date()),
    );
  return total;
}
