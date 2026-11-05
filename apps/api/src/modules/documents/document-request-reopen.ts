import type { DocumentRequest } from '@oneohm/api-contracts';
import { customerActions, customers, type DatabaseExecutor, documents } from '@oneohm/database';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, notFound } from '../../common/http/errors';
import { logAction } from './customer-action-log';
import { reaskCount } from './document-request-home';
import { tellAskedAgain } from './document-request-messages';

/** The customer's name and phone, for a message about their request. */
export async function contactOf(db: DatabaseExecutor, customerId: string) {
  const [customer] = await db
    .select({ customer: customers.name, phone: customers.phoneE164 })
    .from(customers)
    .where(eq(customers.id, customerId));
  if (!customer) throw notFound('That customer');
  return customer;
}

/**
 * A received or closed request opens again with the reason the customer sees, and the
 * customer is asked again (a new round, so the message is sent). "Not right" takes the
 * paper off; a paper filed on another home or kind (`removePaper` false) stays where it now is.
 */
export async function reopenRequest(
  tx: DatabaseExecutor,
  userId: string | null,
  request: DocumentRequest,
  change: { readonly note: string; readonly removePaper: boolean; readonly quiet?: boolean },
): Promise<void> {
  const { id } = request;
  const { note } = change;
  const now = new Date();
  const [reopened] = await tx
    .update(customerActions)
    .set({
      status: 'open',
      documentId: null,
      doneAt: null,
      closedAt: null,
      reason: note,
      updatedAt: now,
    })
    .where(and(eq(customerActions.id, id), inArray(customerActions.status, ['received', 'closed'])))
    .returning({ propertyId: customerActions.propertyId });
  if (!reopened) throw conflict('This request has changed. Refresh and try again.', 'changed');
  if (change.removePaper && request.documentId)
    await tx
      .update(documents)
      .set({ removedAt: now, removedByUserId: userId })
      .where(and(eq(documents.id, request.documentId), isNull(documents.removedAt)));
  const reasks = (await reaskCount(tx, id)) + 1;
  const asked = { ...request, ...(await contactOf(tx, request.customerId)), ...reopened };
  if (!change.quiet) await tellAskedAgain(tx, asked, note, reasks, userId);
  await logAction(tx, request, {
    kind: 'document_request',
    message: `Asked the customer again for ${request.title}`,
    userId,
    data: { customerActionId: id, documentId: request.documentId },
  });
  await recordAudit(tx, userId, 'customer_action.reasked', 'customer_action', id, {
    note,
    documentId: request.documentId,
  });
}
