import type { DatabaseExecutor } from '@oneohm/database';
import { sql } from 'drizzle-orm';
import type { VisitScope } from './visit-reads';

const keyOf = (id: string) => `visit-target:${id}`;

/**
 * The first lock of every change to a visit or to who comes: one transaction at a time per task,
 * service request or lead. Booking takes it first and reassigning takes it before the assignee is
 * changed, so the two always meet in the same order and cannot wait on each other.
 */
export async function lockVisitTarget(tx: DatabaseExecutor, scope: VisitScope): Promise<void> {
  const id = scope.taskId ?? scope.serviceRequestId ?? scope.leadId;
  if (id) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${keyOf(id)}))`);
}

/** The same for several at once, always in id order. */
export async function lockVisitTargets(
  tx: DatabaseExecutor,
  kind: 'taskId' | 'serviceRequestId' | 'leadId',
  ids: readonly string[],
): Promise<void> {
  for (const id of [...ids].sort()) await lockVisitTarget(tx, { [kind]: id });
}
