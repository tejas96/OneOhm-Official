import type { ProjectTask } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  projects,
  projectTasks,
  taskDependencies,
  users,
} from '@oneohm/database';
import { todayIn } from '@oneohm/shared';
import { asc, eq, inArray, type SQL } from 'drizzle-orm';
import { changeRequestsBlocking, openChangeRequestBlocks } from './change-request-blocks';

/** Tasks with their project, assignee and the titles of whatever still blocks them. */
export async function presentTasks(db: DatabaseExecutor, where: SQL): Promise<ProjectTask[]> {
  const rows = await db
    .select({
      task: projectTasks,
      code: projects.code,
      name: projects.name,
      assigneeName: users.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(where)
    .orderBy(asc(projectTasks.dueDate), asc(projectTasks.position));
  const ids = rows.map((row) => row.task.id);
  const deps = ids.length
    ? await db
        .select({
          taskId: taskDependencies.taskId,
          title: projectTasks.title,
          status: projectTasks.status,
        })
        .from(taskDependencies)
        .innerJoin(projectTasks, eq(projectTasks.id, taskDependencies.dependsOnTaskId))
        .where(inArray(taskDependencies.taskId, ids))
    : [];
  const changeBlocks = await openChangeRequestBlocks(db, [
    ...new Set(rows.map((row) => row.task.projectId)),
  ]);
  const today = todayIn();
  return rows.map(({ task, code, name, assigneeName }) => ({
    id: task.id,
    projectId: task.projectId,
    projectCode: code,
    projectName: name,
    templateKey: task.templateKey,
    title: task.title,
    stage: task.stage,
    roleKey: task.roleKey,
    assignee:
      task.assigneeUserId && assigneeName
        ? { id: task.assigneeUserId, fullName: assigneeName }
        : null,
    status: task.status,
    waitingParty: task.waitingParty,
    startDate: task.startDate,
    dueDate: task.dueDate,
    overdue: task.status !== 'completed' && task.dueDate < today,
    customerVisible: task.customerVisible,
    approval: task.approval,
    evidence: task.evidence,
    captures: task.captures,
    blockedBy: [
      ...deps
        .filter((dep) => dep.taskId === task.id && dep.status !== 'completed')
        .map((dep) => dep.title),
      ...(task.status === 'completed'
        ? []
        : changeRequestsBlocking(changeBlocks.get(task.projectId), task)),
    ],
    completedAt: task.completedAt?.toISOString() ?? null,
  }));
}
