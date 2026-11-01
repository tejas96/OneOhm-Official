import { auditLog, type DatabaseExecutor } from '@oneohm/database';

/** Records an important change in the same transaction as the change itself (PRD 7.3). */
export async function recordAudit(
  db: DatabaseExecutor,
  actorUserId: string | null,
  action: string,
  entity: string,
  entityId: string,
  data?: Record<string, unknown>,
): Promise<void> {
  await db.insert(auditLog).values({ actorUserId, action, entity, entityId, data: data ?? null });
}
