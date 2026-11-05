import type { DocumentRequest } from '@oneohm/api-contracts';
import { customerActions, customerHandovers, type Database } from '@oneohm/database';
import { type Capability, nextActionStatus, rightsForAsk } from '@oneohm/domain';
import { and, eq, isNull, like } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden } from '../../common/http/errors';
import { logAction } from './customer-action-log';

/**
 * The team did an ask in person with a customer who is not on WhatsApp: the ask closes, the team's task for
 * it on the handovers list is ticked, and the project log and the audit trail say who did it.
 */
export async function closeInPerson(
  db: Database,
  actor: Actor,
  request: DocumentRequest,
): Promise<void> {
  if (!rightsForAsk(request.type).some((right) => can(actor, right as Capability))) {
    throw forbidden();
  }
  if (
    request.channel !== 'in_person' ||
    !nextActionStatus(request.type, request.status, 'staff_did_it')
  ) {
    throw conflict(
      'Only an open ask that is done in person can be closed this way.',
      'not_in_person',
    );
  }
  await db.transaction((tx) => close(tx, actor.userId, request));
}

async function close(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  userId: string,
  request: DocumentRequest,
): Promise<void> {
  const now = new Date();
  await tx
    .update(customerActions)
    .set({ status: 'closed', doneAt: now, closedAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, request.id), eq(customerActions.status, 'open')));
  // The task was made with the ask: its key is `send:<action>:<ask id>:<press id>`.
  await tx
    .update(customerHandovers)
    .set({ doneAt: now, doneByUserId: userId, note: 'Done in person' })
    .where(
      and(
        like(customerHandovers.dedupeKey, `send:%:${request.id}:%`),
        isNull(customerHandovers.doneAt),
      ),
    );
  await logAction(tx, request, {
    kind: 'document_request',
    message: `${request.title} done in person`,
    userId,
    data: { customerActionId: request.id },
  });
  await recordAudit(tx, userId, 'customer_action.done_in_person', 'customer_action', request.id);
}
