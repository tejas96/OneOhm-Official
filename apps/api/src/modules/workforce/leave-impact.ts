import type { LeaveImpact } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  leads,
  leaveRequests,
  projects,
  projectTasks,
  serviceRequests,
} from '@oneohm/database';
import {
  DEFAULT_SERVICE_CATEGORIES,
  type LeaveTaskReason,
  leaveHalfDays,
  leaveTaskReason,
  type WorkforcePolicy,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, eq, isNotNull, lte, ne, notInArray, or } from 'drizzle-orm';
import { backupsFor } from './leave-backups';
import { clashesFor, NO_CLASHES } from './leave-clash-read';
import { balancesOf, readLeave } from './workforce-read';

export interface LeaveWindow {
  leaveType: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
}

export interface AffectedTask {
  readonly id: string;
  readonly title: string;
  readonly roleKey: string;
  readonly projectId: string;
  readonly projectCode: string;
  readonly managerUserId: string | null;
  readonly dueDate: string;
  readonly customerVisible: boolean;
  readonly reason: LeaveTaskReason;
}

/** Everything a person's leave touches (PRD 4.6, Flow E step 2). */
export interface AffectedWork {
  readonly tasks: readonly AffectedTask[];
  readonly serviceRequests: readonly { id: string; title: string; customerName: string }[];
  readonly followUps: readonly { id: string; name: string; nextActionOn: string }[];
}

export const affectedCount = (work: AffectedWork) =>
  work.tasks.length + work.serviceRequests.length + work.followUps.length;

const categoryLabel = (key: string) =>
  DEFAULT_SERVICE_CATEGORIES.find((category) => category.key === key)?.label ?? key;

/**
 * Open tasks already late, due inside the window or running through it; open service
 * requests the person holds; open leads whose follow-up falls due by the window's end.
 */
export async function affectedWork(
  db: DatabaseExecutor,
  userId: string,
  window: { fromDate: string; toDate: string },
  today: string = todayIn(),
): Promise<AffectedWork> {
  const [taskRows, requestRows, leadRows] = await Promise.all([
    db
      .select({ task: projectTasks, code: projects.code, managerUserId: projects.managerUserId })
      .from(projectTasks)
      .innerJoin(projects, eq(projects.id, projectTasks.projectId))
      .where(
        and(
          eq(projectTasks.assigneeUserId, userId),
          ne(projectTasks.status, 'completed'),
          or(lte(projectTasks.startDate, window.toDate), lte(projectTasks.dueDate, today)),
        ),
      ),
    db
      .select({ request: serviceRequests, customerName: customers.name })
      .from(serviceRequests)
      .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
      .where(
        and(eq(serviceRequests.assigneeUserId, userId), ne(serviceRequests.status, 'resolved')),
      ),
    db
      .select({ id: leads.id, name: leads.name, nextActionOn: leads.nextActionOn })
      .from(leads)
      .where(
        and(
          eq(leads.ownerUserId, userId),
          notInArray(leads.stage, ['won', 'lost']),
          isNotNull(leads.nextActionOn),
          lte(leads.nextActionOn, window.toDate),
        ),
      ),
  ]);
  const tasks = taskRows.flatMap(({ task, code, managerUserId }) => {
    const reason = leaveTaskReason(task, window, today);
    if (!reason) return [];
    return [
      {
        id: task.id,
        title: task.title,
        roleKey: task.roleKey,
        projectId: task.projectId,
        projectCode: code,
        managerUserId,
        dueDate: task.dueDate,
        customerVisible: task.customerVisible,
        reason,
      },
    ];
  });
  return {
    tasks: tasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    serviceRequests: requestRows.map(({ request, customerName }) => ({
      id: request.id,
      title: categoryLabel(request.category),
      customerName,
    })),
    followUps: leadRows.map((lead) => ({
      id: lead.id,
      name: lead.name,
      nextActionOn: lead.nextActionOn ?? window.toDate,
    })),
  };
}

/**
 * Before applying, and for the approver (PRD 4.6, Flow E): days counted, what is left of
 * that kind of leave, the work the leave touches and who could cover it. `requestId`
 * leaves that request itself out of the balance and the overlap check.
 */
export async function leaveImpact(
  db: DatabaseExecutor,
  policy: WorkforcePolicy,
  userId: string,
  window: LeaveWindow,
  requestId?: string,
  backupUserId: string | null = null,
): Promise<LeaveImpact> {
  const halfDays = leaveHalfDays({
    from: window.fromDate,
    to: window.toDate,
    halfDay: window.halfDay,
    weeklyOff: policy.weeklyOff,
  });
  const own = (await readLeave(db, policy, eq(leaveRequests.userId, userId)))
    .map((item) => item.row)
    .filter((row) => row.id !== requestId);
  const balance = balancesOf(policy, own, window.fromDate.slice(0, 4)).find(
    (entry) => entry.leaveType === window.leaveType,
  );
  const left = balance
    ? balance.allowedHalfDays - balance.usedHalfDays - balance.pendingHalfDays
    : 0;
  const overlapsExisting = own.some(
    (row) =>
      (row.status === 'pending' || row.status === 'approved') &&
      row.fromDate <= window.toDate &&
      window.fromDate <= row.toDate,
  );
  const work = await affectedWork(db, userId, window);
  const clashes = await clashesFor(db, [{ id: requestId, userId, backupUserId, ...window }]);
  return {
    halfDays,
    balanceAfterHalfDays: left - halfDays,
    overlapsExisting,
    clashes: clashes.get(requestId ?? '') ?? NO_CLASHES,
    dueInWindow: work.tasks.filter((task) => task.reason === 'due').length,
    tasks: work.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      projectCode: task.projectCode,
      dueDate: task.dueDate,
      customerVisible: task.customerVisible,
      reason: task.reason,
    })),
    serviceRequests: [...work.serviceRequests],
    followUps: [...work.followUps],
    projectCodes: [...new Set(work.tasks.map((task) => task.projectCode))],
    backups: await backupsFor(db, userId, window, [
      ...new Set(work.tasks.map((task) => task.roleKey)),
    ]),
  };
}
