import { DEFAULT_ESCALATION, DEFAULT_TASK_LIBRARY, placeNewTemplates } from '@oneohm/domain';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../client';
import { escalationPolicy, taskTemplates } from '../schema';

/** The task library's keys in the owner's order, before the seed adds anything. */
export async function templateOrder(db: Database): Promise<string[]> {
  const rows = await db
    .select({ key: taskTemplates.key })
    .from(taskTemplates)
    .orderBy(asc(taskTemplates.position), asc(taskTemplates.createdAt));
  return rows.map((row) => row.key);
}

/**
 * Tasks new to OneOhm's library (such as the survey for each kind of site) are placed
 * beside the task before them, not at the library's index, so an owner's order holds.
 */
export async function placeNewLibraryTasks(db: Database, before: readonly string[]): Promise<void> {
  const library = DEFAULT_TASK_LIBRARY.map((template) => template.key);
  if (before.length === 0 || library.every((key) => before.includes(key))) return;
  const order = placeNewTemplates(before, library);
  await db.transaction(async (tx) => {
    for (const [position, key] of order.entries()) {
      await tx.update(taskTemplates).set({ position }).where(eq(taskTemplates.key, key));
    }
  });
}

/** The starting escalation days. An edited policy is left alone. */
export async function seedEscalationPolicy(db: Database): Promise<void> {
  await db
    .insert(escalationPolicy)
    .values({ id: 'default', ...DEFAULT_ESCALATION })
    .onConflictDoNothing({ target: escalationPolicy.id });
}
