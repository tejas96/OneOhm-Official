import type { TaskBoard, TaskBoardQuery } from '@oneohm/api-contracts';
import {
  contractorMembers,
  contractors,
  type Database,
  projects,
  projectTasks,
  users,
} from '@oneohm/database';
import { daysBetween, todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, isNotNull, isNull, lt, ne, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { centerScope, indiaStart } from './command-center-scope';

const MAX_ROWS = 300;
const manager = alias(users, 'manager');
const indiaDate = (instant: Date) => todayIn('Asia/Kolkata', instant);

/** Which tasks each view keeps; done and late look back over the period. */
function viewFilter(show: TaskBoardQuery['show'], today: string, since: Date): SQL | undefined {
  const open = ne(projectTasks.status, 'completed');
  const finished = and(eq(projectTasks.status, 'completed'), gte(projectTasks.completedAt, since));
  switch (show) {
    case 'overdue':
      return and(open, lt(projectTasks.dueDate, today));
    case 'unassigned':
      return and(open, isNull(projectTasks.assigneeUserId));
    case 'waiting':
      return eq(projectTasks.status, 'waiting');
    case 'review':
      return eq(projectTasks.status, 'in_review');
    case 'confirm':
      return and(open, isNotNull(projectTasks.proposedUserId), isNull(projectTasks.assigneeUserId));
    case 'done':
      return finished;
    case 'late':
      return or(
        and(open, lt(projectTasks.dueDate, today)),
        and(
          finished,
          sql`(${projectTasks.completedAt} at time zone 'Asia/Kolkata')::date > ${projectTasks.dueDate}`,
        ),
      );
    default:
      return open;
  }
}

/**
 * Tasks across projects behind every task metric (PRD 3.1, 9 drill-down): the command
 * centre's filters, a view (open, overdue, unowned, waiting, in review, to confirm, done, late) and optional
 * project, person, crew or waiting party. Open views cover live projects, as the
 * command centre counts them; done and late cover every project not cancelled. With a
 * project chosen, the list covers that project whatever its status, and "done" all of it.
 */
export async function taskBoard(db: Database, query: TaskBoardQuery): Promise<TaskBoard> {
  const today = todayIn();
  const scope = centerScope(query, today);
  const show = query.show ?? 'open';
  const lookBack = show === 'done' || show === 'late';
  // One project's own list covers it whatever its status, and all its finished work.
  const projectScope = query.projectId
    ? eq(projectTasks.projectId, query.projectId)
    : lookBack
      ? and(ne(projects.status, 'cancelled'), scope.filters)
      : scope.projects;
  const since = query.projectId && show === 'done' ? new Date(0) : indiaStart(scope.start);
  const where = and(
    projectScope,
    viewFilter(show, today, since),
    query.assigneeUserId ? eq(projectTasks.assigneeUserId, query.assigneeUserId) : undefined,
    query.contractorId ? eq(contractorMembers.contractorId, query.contractorId) : undefined,
    query.party ? eq(projectTasks.waitingParty, query.party) : undefined,
  );
  const rows = await db
    .select({
      task: {
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        title: projectTasks.title,
        stage: projectTasks.stage,
        status: projectTasks.status,
        dueDate: projectTasks.dueDate,
        completedAt: projectTasks.completedAt,
        waitingParty: projectTasks.waitingParty,
        priority: projectTasks.priority,
        assigneeUserId: projectTasks.assigneeUserId,
      },
      projectCode: projects.code,
      projectName: projects.name,
      assigneeName: users.fullName,
      contractorName: contractors.name,
      managerName: manager.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, projectTasks.assigneeUserId))
    .leftJoin(contractors, eq(contractors.id, contractorMembers.contractorId))
    .leftJoin(manager, eq(manager.id, projects.managerUserId))
    .where(where)
    .orderBy(asc(projectTasks.dueDate), asc(projects.code), asc(projectTasks.position))
    .limit(MAX_ROWS + 1);
  const list = rows.slice(0, MAX_ROWS).map(({ task, ...row }) => {
    const completedOn = task.completedAt ? indiaDate(task.completedAt) : null;
    const end = task.status === 'completed' && completedOn ? completedOn : today;
    return {
      id: task.id,
      projectId: task.projectId,
      projectCode: row.projectCode,
      projectName: row.projectName,
      title: task.title,
      stage: task.stage,
      status: task.status,
      dueDate: task.dueDate,
      completedOn,
      daysLate: Math.max(0, daysBetween(task.dueDate, end)),
      waitingParty: task.waitingParty,
      priority: task.priority,
      assignee:
        task.assigneeUserId && row.assigneeName
          ? { id: task.assigneeUserId, name: row.assigneeName }
          : null,
      contractorName: row.contractorName,
      managerName: row.managerName,
    };
  });
  if (show === 'late') list.sort((a, b) => b.daysLate - a.daysLate);
  if (show === 'done')
    list.sort((a, b) => (b.completedOn ?? '').localeCompare(a.completedOn ?? ''));
  return {
    range: { start: scope.start, end: scope.end },
    rows: list,
    truncated: rows.length > MAX_ROWS,
  };
}
