import type { ProjectTask } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documents,
  projectFacts,
  projects,
  projectTasks,
  taskDependencies,
  users,
} from '@oneohm/database';
import { factField, missingEvidence } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';

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
  const files = ids.length
    ? await db
        .select()
        .from(documents)
        .where(
          and(
            inArray(documents.taskId, ids),
            isNull(documents.replacedAt),
            isNull(documents.removedAt),
          ),
        )
        .orderBy(asc(documents.createdAt))
    : [];
  const projectIds = [...new Set(rows.map((row) => row.task.projectId))];
  const facts = projectIds.length
    ? await db
        .select({
          projectId: projectFacts.projectId,
          key: projectFacts.key,
          value: projectFacts.value,
        })
        .from(projectFacts)
        .where(inArray(projectFacts.projectId, projectIds))
    : [];
  const today = todayIn();
  return rows.map(({ task, code, name, assigneeName }) => {
    const attached = files.filter((file) => file.taskId === task.id);
    const known = facts.filter(
      (fact) => fact.projectId === task.projectId && task.captures.includes(fact.key),
    );
    return {
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
      captureFields: task.captures.map(factField),
      knownFacts: Object.fromEntries(known.map((fact) => [fact.key, fact.value])),
      attachments: attached.map((file) => ({
        id: file.id,
        name: file.name,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt.toISOString(),
      })),
      missingEvidence:
        task.status === 'completed'
          ? []
          : missingEvidence(
              task.evidence,
              attached.map((file) => file.contentType),
            ),
      blockedBy: deps
        .filter((dep) => dep.taskId === task.id && dep.status !== 'completed')
        .map((dep) => dep.title),
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  });
}
