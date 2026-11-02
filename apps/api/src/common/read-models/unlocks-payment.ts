import { type DatabaseExecutor, paymentMilestones } from '@oneohm/database';
import { and, inArray, isNull } from 'drizzle-orm';

/** `projectId:trigger` for every payment milestone still waiting for its task. */
export async function waitingPayments(
  db: DatabaseExecutor,
  projectIds: readonly string[],
): Promise<Set<string>> {
  if (projectIds.length === 0) return new Set();
  const rows = await db
    .select({ projectId: paymentMilestones.projectId, trigger: paymentMilestones.trigger })
    .from(paymentMilestones)
    .where(
      and(inArray(paymentMilestones.projectId, [...projectIds]), isNull(paymentMilestones.dueAt)),
    );
  return new Set(rows.map((row) => `${row.projectId}:${row.trigger}`));
}

/** Finishing the task makes a payment due: the project has one still waiting on it. */
export function unlocksPayment(
  projectId: string,
  onComplete: string | null,
  waiting: ReadonlySet<string>,
): boolean {
  if (!onComplete || onComplete === 'project_operational') return false;
  return waiting.has(`${projectId}:${onComplete}`);
}
