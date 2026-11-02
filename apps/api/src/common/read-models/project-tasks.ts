import type { ProjectTask } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documents,
  projectFacts,
  projects,
  projectTasks,
  users,
} from '@oneohm/database';
import { checklistFor, factField, measurementsFor, missingEvidence } from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { changeRequestsBlocking, openChangeRequestBlocks } from './change-request-blocks';
import { assignmentStates } from './task-assignment-state';
import { blockerDetails } from './task-blockers';
import { blockingTitles, loadTaskLinks } from './task-blocking';
import { reviewStateOf, reviewStates } from './task-review-state';

/** Tasks with their project, assignee and the titles of whatever still blocks them. */
export async function presentTasks(db: DatabaseExecutor, where: SQL): Promise<ProjectTask[]> {
  const rows = await db
    .select({
      task: projectTasks,
      code: projects.code,
      name: projects.name,
      managerUserId: projects.managerUserId,
      assigneeName: users.fullName,
    })
    .from(projectTasks)
    .innerJoin(projects, eq(projects.id, projectTasks.projectId))
    .leftJoin(users, eq(users.id, projectTasks.assigneeUserId))
    .where(where)
    .orderBy(asc(projectTasks.dueDate), asc(projectTasks.position));
  const ids = rows.map((row) => row.task.id);
  const { deps, dependents } = await loadTaskLinks(db, ids);
  const setterIds = [
    ...new Set(rows.map((row) => row.task.prioritySetByUserId).filter((id) => id !== null)),
  ];
  const setters = setterIds.length
    ? await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(inArray(users.id, setterIds))
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
  const changeBlocks = await openChangeRequestBlocks(db, projectIds);
  const assignment = await assignmentStates(
    db,
    rows.map((row) => row.task),
  );
  const reviews = await reviewStates(
    db,
    rows.map((row) => ({ ...row.task, managerUserId: row.managerUserId })),
  );
  const today = todayIn();
  return rows.map(({ task, code, name, assigneeName }) => {
    const attached = files.filter((file) => file.taskId === task.id);
    const changes =
      task.status === 'completed'
        ? []
        : changeRequestsBlocking(changeBlocks.get(task.projectId), task);
    const measurements = measurementsFor(task).filter((key) => !task.captures.includes(key));
    const fields = [...task.captures, ...measurements];
    const recorded = new Set(
      facts.filter((fact) => fact.projectId === task.projectId).map((fact) => fact.key),
    );
    const known = facts.filter(
      (fact) => fact.projectId === task.projectId && fields.includes(fact.key),
    );
    return {
      id: task.id,
      projectId: task.projectId,
      projectCode: code,
      projectName: name,
      templateKey: task.templateKey,
      title: task.title,
      description: task.description,
      stage: task.stage,
      roleKey: task.roleKey,
      assignee:
        task.assigneeUserId && assigneeName
          ? { id: task.assigneeUserId, fullName: assigneeName }
          : null,
      proposedAssignee: assignment.get(task.id)?.proposedAssignee ?? null,
      outsideTeam: task.outsideTeam,
      status: task.status,
      waitingParty: task.waitingParty,
      startDate: task.startDate,
      dueDate: task.dueDate,
      overdue: task.status !== 'completed' && task.dueDate < today,
      customerVisible: task.customerVisible,
      approval: task.approval,
      reviewer: task.reviewer === 'project_manager' ? 'project_manager' : 'approvers',
      ...reviewStateOf(reviews, task.id),
      evidence: task.evidence,
      captures: task.captures,
      captureFields: fields.map(factField),
      measurements: measurementsFor(task),
      knownFacts: Object.fromEntries(known.map((fact) => [fact.key, fact.value])),
      checklist: checklistFor(task).map((item) => ({ ...item, done: recorded.has(item.key) })),
      attachments: attached.map((file) => ({
        id: file.id,
        name: file.name,
        contentType: file.contentType,
        category: file.category,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt.toISOString(),
      })),
      missingEvidence: task.status === 'completed' ? [] : missingEvidence(task, attached, recorded),
      blockedBy: [
        ...deps
          .filter((dep) => dep.taskId === task.id && dep.status !== 'completed')
          .map((dep) => dep.title),
        ...changes,
        ...[assignment.get(task.id)?.budgetBlock ?? ''].filter(Boolean),
      ],
      changeBlockers: changes,
      blocking: blockingTitles(task.id, task.status === 'completed', dependents),
      blockers:
        task.status === 'completed'
          ? []
          : deps
              .filter((dep) => dep.taskId === task.id && dep.status !== 'completed')
              .map((dep) => blockerDetails(dep, today)),
      priority: task.priority,
      prioritySetBy: setters.find((user) => user.id === task.prioritySetByUserId) ?? null,
      unlocksPayment: Boolean(task.onComplete) && task.onComplete !== 'project_operational',
      blocksUrgent:
        task.status !== 'completed' &&
        dependents.some(
          (dep) =>
            dep.dependsOnTaskId === task.id &&
            dep.status !== 'completed' &&
            dep.priority === 'urgent',
        ),
      completedAt: task.completedAt?.toISOString() ?? null,
    };
  });
}
