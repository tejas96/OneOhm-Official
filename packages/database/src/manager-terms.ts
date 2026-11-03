import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DatabaseExecutor, Transaction } from './client';
import { projectManagerTerms } from './schema/project-team.schema';

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
