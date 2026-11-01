import type { CommandCenter, RiskItem } from '@oneohm/api-contracts';
import { type Database, projects, projectTasks, users } from '@oneohm/database';
import { addDays, daysBetween } from '@oneohm/shared';
import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
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
      task: {
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        title: projectTasks.title,
        dueDate: projectTasks.dueDate,
        status: projectTasks.status,
        waitingSince: projectTasks.waitingSince,
        waitingParty: projectTasks.waitingParty,
        assigneeUserId: projectTasks.assigneeUserId,
      },
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
    .select({
      task: {
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        title: projectTasks.title,
        dueDate: projectTasks.dueDate,
        customerVisible: projectTasks.customerVisible,
      },
      code: projects.code,
      assignee: users.fullName,
    })
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
