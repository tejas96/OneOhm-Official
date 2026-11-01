import {
  type DatabaseExecutor,
  projectTasks,
  roles,
  taskTemplates,
  userRoles,
  users,
} from '@oneohm/database';
import type { AssigneeCandidate, TaskConditions, TaskTemplate } from '@oneohm/domain';
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm';

/** The active task templates, in library order, as the domain engine expects them. */
export async function loadTaskLibrary(db: DatabaseExecutor): Promise<TaskTemplate[]> {
  const rows = await db
    .select()
    .from(taskTemplates)
    .where(eq(taskTemplates.active, true))
    .orderBy(asc(taskTemplates.position));
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    stage: row.stage,
    roleKey: row.roleKey,
    offsetDays: row.offsetDays,
    durationDays: row.durationDays,
    dependsOn: row.dependsOn,
    ...(row.conditions ? { when: row.conditions as TaskConditions } : {}),
    waitingParty: row.waitingParty,
    customerVisible: row.customerVisible,
    notifyCustomer: row.notifyCustomer,
    approval: row.approval,
    evidence: row.evidence as TaskTemplate['evidence'],
    captures: row.captures,
    ...(row.onComplete
      ? { onComplete: row.onComplete as NonNullable<TaskTemplate['onComplete']> }
      : {}),
    reports: row.reports,
  }));
}

/** Everyone who could take a task: active people, their role keys, open work and leave. */
export async function loadAssigneeCandidates(db: DatabaseExecutor): Promise<AssigneeCandidate[]> {
  const people = await db
    .select({ userId: users.id, onLeave: users.onLeave, roleKey: roles.key })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .where(eq(users.status, 'active'));
  const loads = await db
    .select({ userId: projectTasks.assigneeUserId, open: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(ne(projectTasks.status, 'completed'))
    .groupBy(projectTasks.assigneeUserId);
  const byUser = new Map<string, AssigneeCandidate>();
  for (const person of people) {
    const existing = byUser.get(person.userId);
    const roleKeys = [...(existing?.roleKeys ?? []), person.roleKey];
    byUser.set(person.userId, {
      userId: person.userId,
      roleKeys,
      onLeave: person.onLeave,
      openTasks: loads.find((load) => load.userId === person.userId)?.open ?? 0,
    });
  }
  // The Super Admin is a safety net, not a default assignee.
  return [...byUser.values()].filter(
    (candidate) => !(candidate.roleKeys.length === 1 && candidate.roleKeys[0] === 'super_admin'),
  );
}
