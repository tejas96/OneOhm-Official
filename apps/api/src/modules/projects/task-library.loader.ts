import {
  contractorMembers,
  contractors,
  type DatabaseExecutor,
  leaveRequests,
  projectTasks,
  roles,
  taskTemplates,
  userRoles,
  userSkills,
  users,
} from '@oneohm/database';
import type {
  AssigneeCandidate,
  ContractorOption,
  TaskConditions,
  TaskTemplate,
} from '@oneohm/domain';
import { todayIn } from '@oneohm/shared';
import { and, asc, eq, gte, isNull, ne, or, sql } from 'drizzle-orm';

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
    description: row.description,
    stage: row.stage,
    roleKey: row.roleKey,
    skillKey: row.skillKey,
    offsetDays: row.offsetDays,
    durationDays: row.durationDays,
    dependsOn: row.dependsOn,
    ...(row.conditions ? { when: row.conditions as TaskConditions } : {}),
    waitingParty: row.waitingParty,
    customerVisible: row.customerVisible,
    notifyCustomer: row.notifyCustomer,
    approval: row.approval,
    reviewer: row.reviewer === 'project_manager' ? 'project_manager' : 'approvers',
    evidence: row.evidence as TaskTemplate['evidence'],
    captures: row.captures,
    checklist: row.checklist ?? null,
    ...(row.onComplete
      ? { onComplete: row.onComplete as NonNullable<TaskTemplate['onComplete']> }
      : {}),
    reports: row.reports,
    confirmAssignee: row.confirmAssignee,
    escalateAfterDays: row.escalateAfterDays,
  }));
}

/**
 * Everyone who could take a task: active people (not the crew of a switched-off
 * contractor), their role keys, open work and approved leave.
 */
export async function loadAssigneeCandidates(db: DatabaseExecutor): Promise<AssigneeCandidate[]> {
  const people = await db
    .select({ userId: users.id, onLeave: users.onLeave, roleKey: roles.key })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, and(eq(roles.id, userRoles.roleId), isNull(roles.archivedAt)))
    .leftJoin(contractorMembers, eq(contractorMembers.userId, users.id))
    .leftJoin(contractors, eq(contractors.id, contractorMembers.contractorId))
    // A switched-off contractor's crew takes no new work (PRD 3.13).
    .where(
      and(eq(users.status, 'active'), or(isNull(contractors.id), eq(contractors.active, true))),
    );
  const loads = await db
    .select({ userId: projectTasks.assigneeUserId, open: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(ne(projectTasks.status, 'completed'))
    .groupBy(projectTasks.assigneeUserId);
  const leave = await db
    .select({
      userId: leaveRequests.userId,
      from: leaveRequests.fromDate,
      to: leaveRequests.toDate,
    })
    .from(leaveRequests)
    .where(and(eq(leaveRequests.status, 'approved'), gte(leaveRequests.toDate, todayIn())));
  const held = await db
    .select({ userId: userSkills.userId, key: userSkills.skillKey })
    .from(userSkills);
  // When each person last got new work, for round robin (PRD 7.2 assignment rules).
  const turns = await db
    .select({
      userId: projectTasks.assigneeUserId,
      last: sql<
        string | null
      >`to_char(max(${projectTasks.createdAt}) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`,
    })
    .from(projectTasks)
    .groupBy(projectTasks.assigneeUserId);
  const byUser = new Map<string, AssigneeCandidate>();
  for (const person of people) {
    const existing = byUser.get(person.userId);
    const roleKeys = [...(existing?.roleKeys ?? []), person.roleKey];
    byUser.set(person.userId, {
      userId: person.userId,
      roleKeys,
      skills: held.filter((row) => row.userId === person.userId).map((row) => row.key),
      onLeave: person.onLeave,
      away: leave.filter((row) => row.userId === person.userId),
      openTasks: loads.find((load) => load.userId === person.userId)?.open ?? 0,
      lastAssignedAt: turns.find((row) => row.userId === person.userId)?.last ?? null,
    });
  }
  // The Super Admin is a safety net, not a default assignee.
  return [...byUser.values()].filter(
    (candidate) => !(candidate.roleKeys.length === 1 && candidate.roleKeys[0] === 'super_admin'),
  );
}

/**
 * Every contractor with its crew, lead and open work, as the assignment engine sees it.
 * The roles they take are their skills, or the roles their crew hold when none are set.
 */
export async function loadContractorOptions(
  db: DatabaseExecutor,
  candidates: readonly AssigneeCandidate[],
): Promise<{ options: ContractorOption[]; crewOf: Map<string, string> }> {
  const rows = await db.select().from(contractors);
  const members = await db.select().from(contractorMembers);
  const crewOf = new Map(members.map((member) => [member.userId, member.contractorId]));
  const options = rows.map((row) => {
    const crew = members.filter((member) => member.contractorId === row.id);
    const people = candidates.filter((person) => crewOf.get(person.userId) === row.id);
    return {
      id: row.id,
      active: row.active,
      roleKeys:
        row.skills.length > 0 ? row.skills : [...new Set(people.flatMap((p) => p.roleKeys))],
      serviceAreas: row.serviceAreas,
      crew: people.map((person) => person.userId),
      leadUserId: crew.find((member) => member.lead)?.userId ?? null,
      openTasks: people.reduce((sum, person) => sum + person.openTasks, 0),
    };
  });
  return { options, crewOf };
}
