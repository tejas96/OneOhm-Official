import {
  leadActivities,
  leads,
  type leaveRequests,
  type Notice,
  notify,
  projectActivities,
  projectTasks,
  serviceRequests,
  type Transaction,
  users,
} from '@oneohm/database';
import { inArray, sql } from 'drizzle-orm';
import { daySpan } from '../../common/notices';
import { followAssignees } from '../visits/follow-assignee';
import type { AffectedWork } from './leave-impact';

type LeaveRow = typeof leaveRequests.$inferSelect;

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
const items = (n: number) => count(n, 'task', 'tasks');

function coveringBody(work: AffectedWork): string {
  const parts = [
    [work.tasks.length, 'task', 'tasks'],
    [work.serviceRequests.length, 'service request', 'service requests'],
    [work.followUps.length, 'lead follow-up', 'lead follow-ups'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, one, many]) => count(n, one, many));
  const total = parts.reduce((sum, [n]) => sum + n, 0);
  return `${said.join(', ')} ${total === 1 ? 'is' : 'are'} now yours.`;
}

const NOTICES = {
  covering: (id: string, name: string, work: AffectedWork): Notice => ({
    kind: 'leave_cover',
    title: `You are covering for ${name}`,
    body: coveringBody(work),
    subject: { type: 'leave', id },
    dedupeKey: `leave_cover:${id}`,
  }),
  managers: (
    leave: LeaveRow,
    name: string,
    project: { id: string; code: string; count: number },
    backup: string | null,
  ): Notice => ({
    kind: 'leave_project',
    title: `${name} is on leave ${daySpan(leave.fromDate, leave.toDate)}`,
    body: backup
      ? `${project.code}: ${items(project.count)} handed to ${backup}.`
      : `${project.code}: ${items(project.count)} with nobody covering (emergency leave).`,
    subject: { type: 'project', id: project.id, projectId: project.id },
    dedupeKey: `leave_project:${leave.id}:${project.id}`,
  }),
};

async function nameOf(tx: Transaction, id: string): Promise<string> {
  const [row] = await tx
    .select({ fullName: users.fullName })
    .from(users)
    .where(inArray(users.id, [id]));
  return row?.fullName ?? 'a colleague';
}

/**
 * On approval (Flow E step 4): the affected tasks, service requests and lead follow-ups
 * go to the backup, with a note on each project and lead, and the backup is told.
 * Returns how many items moved.
 */
export async function handOverWork(
  tx: Transaction,
  approverId: string,
  leave: LeaveRow,
  backupId: string,
  work: AffectedWork,
): Promise<number> {
  const now = new Date();
  const [person, backup] = await Promise.all([nameOf(tx, leave.userId), nameOf(tx, backupId)]);
  if (work.tasks.length > 0) {
    await tx
      .update(projectTasks)
      .set({ assigneeUserId: backupId, updatedAt: now })
      .where(
        inArray(
          projectTasks.id,
          work.tasks.map((task) => task.id),
        ),
      );
    await followAssignees(
      tx,
      'taskId',
      work.tasks.map((task) => task.id),
      backupId,
      approverId,
    );
    await tx.insert(projectActivities).values(
      work.tasks.map((task) => ({
        projectId: task.projectId,
        taskId: task.id,
        kind: 'task_handover',
        message: `${task.title} handed to ${backup} during ${person}'s leave.`,
        userId: approverId,
      })),
    );
  }
  if (work.serviceRequests.length > 0) {
    const requestIds = work.serviceRequests.map((request) => request.id);
    await tx
      .update(serviceRequests)
      .set({ assigneeUserId: backupId, updatedAt: now })
      .where(inArray(serviceRequests.id, requestIds));
    await followAssignees(tx, 'serviceRequestId', requestIds, backupId, approverId);
  }
  if (work.followUps.length > 0) {
    const ids = work.followUps.map((lead) => lead.id);
    await tx
      .update(leads)
      .set({ ownerUserId: backupId, version: sql`${leads.version} + 1`, updatedAt: now })
      .where(inArray(leads.id, ids));
    await followAssignees(tx, 'leadId', ids, backupId, approverId);
    await tx.insert(leadActivities).values(
      ids.map((leadId) => ({
        leadId,
        kind: 'note' as const,
        note: `Follow-up handed to ${backup} during ${person}'s leave.`,
        userId: approverId,
        internal: true,
      })),
    );
  }
  const total = work.tasks.length + work.serviceRequests.length + work.followUps.length;
  if (total > 0) await notify(tx, { userId: backupId }, NOTICES.covering(leave.id, person, work));
  return total;
}

/**
 * Flow E step 5: the managers of projects whose tasks the leave touches are told who is
 * away and who covers (or that nobody does, for emergency leave).
 */
export async function tellProjectManagers(
  tx: Transaction,
  leave: LeaveRow,
  work: AffectedWork,
  backupId: string | null,
): Promise<void> {
  const byProject = new Map<string, { id: string; code: string; count: number; manager: string }>();
  for (const task of work.tasks) {
    if (!task.managerUserId || task.managerUserId === leave.userId) continue;
    const entry = byProject.get(task.projectId) ?? {
      id: task.projectId,
      code: task.projectCode,
      count: 0,
      manager: task.managerUserId,
    };
    entry.count += 1;
    byProject.set(task.projectId, entry);
  }
  if (byProject.size === 0) return;
  const person = await nameOf(tx, leave.userId);
  const backup = backupId ? await nameOf(tx, backupId) : null;
  for (const project of byProject.values()) {
    await notify(tx, { userId: project.manager }, NOTICES.managers(leave, person, project, backup));
  }
}
