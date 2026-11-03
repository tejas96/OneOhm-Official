import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DatabaseExecutor, Transaction } from './client';
import { users } from './schema/identity.schema';
import { projectManagerTerms } from './schema/project-team.schema';
import { projects } from './schema/projects.schema';

export interface ManagerTerm {
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
}

/**
 * Hands a project to a new manager from `at`: closes the open term and, unless `userId`
 * is null (no manager), opens the next. Nothing changes when that person already holds it.
 */
export async function openManagerTerm(
  tx: Transaction,
  projectId: string,
  userId: string | null,
  at: Date,
): Promise<void> {
  const [open] = await tx
    .select({ id: projectManagerTerms.id, userId: projectManagerTerms.userId })
    .from(projectManagerTerms)
    .where(and(eq(projectManagerTerms.projectId, projectId), isNull(projectManagerTerms.endedAt)));
  if (open && open.userId === userId) return;
  if (open) {
    await tx
      .update(projectManagerTerms)
      .set({ endedAt: at })
      .where(eq(projectManagerTerms.id, open.id));
  }
  if (userId !== null) {
    await tx.insert(projectManagerTerms).values({ projectId, userId, startedAt: at });
  }
}

/** Every manager a project has had, oldest first. */
export async function managerTermsOf(
  db: DatabaseExecutor,
  projectId: string,
): Promise<ManagerTerm[]> {
  return db
    .select({
      userId: projectManagerTerms.userId,
      startedAt: projectManagerTerms.startedAt,
      endedAt: projectManagerTerms.endedAt,
    })
    .from(projectManagerTerms)
    .where(eq(projectManagerTerms.projectId, projectId))
    .orderBy(asc(projectManagerTerms.startedAt));
}

/**
 * One rule everywhere: a manager who is no longer active counts as no manager, so reviews
 * and alerts fall back to the people who hold the right instead of waiting on them.
 */
export async function activeManagerOf(
  db: DatabaseExecutor,
  projectId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(projects)
    .innerJoin(users, eq(users.id, projects.managerUserId))
    .where(and(eq(projects.id, projectId), eq(users.status, 'active')))
    .limit(1);
  return row?.id ?? null;
}

/** Which of these people are active: for lists of projects, without a lookup per row. */
export async function activeUserIds(
  db: DatabaseExecutor,
  userIds: readonly (string | null)[],
): Promise<Set<string>> {
  const ids = [...new Set(userIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, ids), eq(users.status, 'active')));
  return new Set(rows.map((row) => row.id));
}

/** For queries over `projects`: join this, and select `liveManagerId` for the active manager. */
export const managerUser = alias(users, 'manager_user');
export const liveManagerId = sql<
  string | null
>`case when ${managerUser.status} = 'active' then ${projects.managerUserId} end`;
