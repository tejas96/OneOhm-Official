import type { DocumentRequest } from '@oneohm/api-contracts';
import {
  customers,
  type DatabaseExecutor,
  documentRequests,
  documents,
  projectActivities,
} from '@oneohm/database';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict, notFound } from '../../common/http/errors';
import { reaskCount } from './document-request-home';
import { askCustomer } from './document-request-messages';

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
 * A received request opens again with the note the customer sees, and the customer is
 * asked again (a new round, so the message is sent). "Not right" takes the paper off;
 * a paper filed on another home or kind (`removePaper` false) stays where it now is.
 */
export async function reopenRequest(
  tx: DatabaseExecutor,
  userId: string,
  request: DocumentRequest,
  change: { readonly note: string; readonly removePaper: boolean },
): Promise<void> {
  const { id } = request;
  const { note } = change;
  const now = new Date();
  const [reopened] = await tx
    .update(documentRequests)
    .set({ status: 'open', documentId: null, receivedAt: null, note, updatedAt: now })
    .where(and(eq(documentRequests.id, id), eq(documentRequests.status, 'received')))
    .returning({ id: documentRequests.id });
  if (!reopened) throw conflict('This request has changed. Refresh and try again.', 'changed');
  if (change.removePaper && request.documentId)
    await tx
      .update(documents)
      .set({ removedAt: now, removedByUserId: userId })
      .where(and(eq(documents.id, request.documentId), isNull(documents.removedAt)));
  const reasks = (await reaskCount(tx, id)) + 1;
  await askCustomer(tx, { ...request, ...(await contactOf(tx, request.customerId)) }, reasks);
  if (request.projectId)
    await tx.insert(projectActivities).values({
      projectId: request.projectId,
      kind: 'document_request',
      message: `Asked the customer again for ${request.title}`,
      userId,
      data: { documentRequestId: id, documentId: request.documentId },
    });
  await recordAudit(tx, userId, 'document_request.reasked', 'document_request', id, {
    note,
    documentId: request.documentId,
  });
}
