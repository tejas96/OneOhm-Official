import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import type { CustomerActionType } from '@oneohm/domain';
import { and, eq, sql } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import type { SendContext } from './send-context';

/** The open action of this type for the same thing (a home, an instalment), if there is one. */
export async function openActionFor(
  tx: DatabaseExecutor,
  customerId: string,
  type: CustomerActionType,
  match: { propertyId?: string; milestoneId?: string; target?: string },
): Promise<string | null> {
  const [row] = await tx
    .select({ id: customerActions.id })
    .from(customerActions)
    .where(
      and(
        eq(customerActions.customerId, customerId),
        eq(customerActions.type, type),
        eq(customerActions.status, 'open'),
        match.propertyId ? eq(customerActions.propertyId, match.propertyId) : undefined,
        match.target ? sql`${customerActions.payload}->>'target' = ${match.target}` : undefined,
        match.milestoneId
          ? sql`${customerActions.payload}->>'milestoneId' = ${match.milestoneId}`
          : undefined,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Records what the team asked the customer to do (redesign §2): one customer action with its
 * status, the project (or lead) log line and the audit row. Returns its id.
 */
export async function openAction(
  tx: DatabaseExecutor,
  ctx: SendContext,
  userId: string,
  input: {
    id: string;
    type: 'location' | 'pay' | 'callback' | 'visit_pick';
    taskId?: string | null;
    title: string;
    propertyId?: string | null;
    projectId?: string | null;
    payload?: Record<string, unknown>;
    log: string;
  },
): Promise<string> {
  const projectId = input.projectId ?? ctx.projectId;
  const [row] = await tx
    .insert(customerActions)
    .values({
      id: input.id,
      type: input.type,
      customerId: ctx.customerId,
      projectId,
      leadId: projectId ? null : ctx.leadId,
      propertyId: input.propertyId ?? null,
      taskId: input.taskId ?? ctx.taskId,
      title: input.title,
      payload: input.payload ?? {},
      requestedByUserId: userId,
    })
    .returning({ id: customerActions.id });
  if (!row) throw new Error('Customer action insert returned nothing');
  await logAction(
    tx,
    { projectId, leadId: projectId ? null : ctx.leadId },
    { kind: 'customer_action', message: input.log, userId, data: { customerActionId: row.id } },
  );
  await recordAudit(tx, userId, 'customer_action.created', 'customer_action', row.id, {
    type: input.type,
    ...(projectId ? { project: ctx.projectCode } : {}),
  });
  return row.id;
}

/** A send with no customer action (a document, a crew contact, a delay notice): log and audit only. */
export async function logSend(
  tx: DatabaseExecutor,
  ctx: SendContext,
  userId: string,
  what: { audit: string; entity: string; entityId: string; log: string; projectId?: string | null },
  data: Record<string, unknown> = {},
): Promise<void> {
  const projectId = what.projectId ?? ctx.projectId;
  await logAction(
    tx,
    { projectId, leadId: projectId ? null : ctx.leadId },
    { kind: 'customer_action', message: what.log, userId, data },
  );
  await recordAudit(tx, userId, what.audit, what.entity, what.entityId, data);
}
