import type { CommandCenter, RiskItem } from '@oneohm/api-contracts';
import {
  changeRequests,
  type Database,
  payables,
  projects,
  projectTasks,
  quotations,
  serviceRequests,
  users,
} from '@oneohm/database';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { CenterScope } from './command-center-scope';

const MAX_RISKS = 6;
const MAX_DEADLINES = 12;
const manager = alias(users, 'manager');

/**
 * What could slip, most pressing first (PRD 3.1): overdue work, then work waiting on a
 * customer, bank or DISCOM, then work nobody owns that falls due within a week.
 */
export async function risksIn(db: Database, scope: CenterScope): Promise<RiskItem[]> {
  const rows = await db
    .select({
      task: projectTasks,
      code: projects.code,
      name: projects.name,
      owner: users.fullName,
      managerName: manager.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .leftJoin(manager, eq(manager.id, projects.managerUserId))
    .where(and(scope.projects, ne(projectTasks.status, 'completed')));
  const soon = addDays(scope.today, 7);
  const items = rows.flatMap(({ task, code, name, owner, managerName }): RiskItem[] => {
    const base = {
      taskId: task.id,
      projectId: task.projectId,
      projectCode: code,
      projectName: name,
      taskTitle: task.title,
      dueDate: task.dueDate,
      owner,
      managerName,
    };
    if (task.status === 'waiting' && task.waitingSince) {
      const days = daysBetween(task.waitingSince.toISOString().slice(0, 10), scope.today);
      return [{ ...base, kind: 'waiting', days, party: task.waitingParty }];
    }
    if (task.dueDate < scope.today) {
      const days = daysBetween(task.dueDate, scope.today);
      return [{ ...base, kind: 'overdue', days, party: 'internal' }];
    }
    if (!task.assigneeUserId && task.dueDate <= soon && task.status === 'ready') {
      return [{ ...base, kind: 'unassigned', days: 0, party: 'internal' }];
    }
    return [];
  });
  const rank = { overdue: 0, waiting: 1, unassigned: 2 } as const;
  return items
    .sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] || b.days - a.days || a.dueDate.localeCompare(b.dueDate),
    )
    .slice(0, MAX_RISKS);
}

/** Open tasks due in the next seven days on the projects in view, soonest first. */
export async function deadlinesIn(
  db: Database,
  scope: CenterScope,
): Promise<CommandCenter['deadlines']> {
  const rows = await db
    .select({ task: projectTasks, code: projects.code, assignee: users.fullName })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(
      and(
        scope.projects,
        ne(projectTasks.status, 'completed'),
        gte(projectTasks.dueDate, scope.today),
        lte(projectTasks.dueDate, addDays(scope.today, 7)),
      ),
    )
    .orderBy(asc(projectTasks.dueDate), asc(projectTasks.position))
    .limit(MAX_DEADLINES);
  return rows.map(({ task, code, assignee }) => ({
    taskId: task.id,
    projectId: task.projectId,
    projectCode: code,
    title: task.title,
    dueDate: task.dueDate,
    assignee,
    customerVisible: task.customerVisible,
  }));
}

const countOf = async (query: Promise<{ count: number }[]>) => (await query)[0]?.count ?? 0;
const counted = sql<number>`count(*)::int`;

/** Decisions waiting on someone at OneOhm; each links to where it is made. */
export async function decisionsWaiting(db: Database): Promise<CommandCenter['decisions']> {
  const [discounts, reviews, bills, changes, service, claims] = await Promise.all([
    countOf(
      db
        .select({ count: counted })
        .from(quotations)
        .where(
          and(
            inArray(quotations.status, ['draft', 'sent']),
            isNull(quotations.discountApprovedByUserId),
            ne(quotations.discountPaise, 0),
          ),
        ),
    ),
    countOf(
      db.select({ count: counted }).from(projectTasks).where(eq(projectTasks.status, 'in_review')),
    ),
    countOf(db.select({ count: counted }).from(payables).where(eq(payables.status, 'pending'))),
    countOf(
      db.select({ count: counted }).from(changeRequests).where(eq(changeRequests.status, 'open')),
    ),
    countOf(
      db.select({ count: counted }).from(serviceRequests).where(eq(serviceRequests.status, 'open')),
    ),
    countOf(
      db
        .select({ count: counted })
        .from(projectTasks)
        .where(
          and(
            eq(projectTasks.templateKey, 'loan_disbursement_claim'),
            inArray(projectTasks.status, ['ready', 'in_progress']),
          ),
        ),
    ),
  ]);
  return [
    { key: 'discounts' as const, count: discounts, href: '/quotations' },
    { key: 'task_reviews' as const, count: reviews, href: '/today' },
    { key: 'bills' as const, count: bills, href: '/finance?tab=payables' },
    { key: 'change_requests' as const, count: changes, href: '/discom' },
    { key: 'service_requests' as const, count: service, href: '/service' },
    { key: 'bank_claims' as const, count: claims, href: '/finance?tab=loans' },
  ].filter((decision) => decision.count > 0);
}
