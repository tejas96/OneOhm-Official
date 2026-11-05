import type { DocumentRequest } from '@oneohm/api-contracts';
import { customerActions, type DatabaseExecutor, leads } from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logLead } from '../crm/lead-history';
import { logAction } from './customer-action-log';
import { homeOfRequest, openRequestsFor } from './document-request-home';
import { readRequests } from './document-request-read';
import { reopenRequest } from './document-request-reopen';

/** What the customer reads on a request reopened because its paper went elsewhere. */
export const FILED_ELSEWHERE = 'Filed on another home';

/** A note on the open lead of a home that has no project yet (staff only, internal). */
export async function logOnHomeLead(
  tx: DatabaseExecutor,
  propertyId: string,
  userId: string,
  note: string,
): Promise<void> {
  const [lead] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.propertyId, propertyId), notInArray(leads.stage, ['won', 'lost'])))
    .limit(1);
  if (lead) await logLead(tx, lead.id, userId, 'note', note, true);
}

/**
 * Requests this paper answered for another home or kind: asked again ("ask again"), or,
 * when a newer request for that paper is already open, closed quietly (the customer is
 * already asked; telling them twice would only confuse).
 */
export async function settleAnsweredRequests(
  tx: DatabaseExecutor,
  userId: string | null,
  documentId: string,
  now: { readonly propertyId: string | null; readonly category: string },
  /** The customer moved it themselves, so they are not told their own change (WhatsApp [Change]). */
  quiet = false,
): Promise<void> {
  const answered = await readRequests(
    tx,
    and(
      eq(customerActions.documentId, documentId),
      inArray(customerActions.status, ['received', 'closed']),
    ),
  );
  for (const request of answered) {
    const home = await homeOfRequest(tx, request.id);
    const sameHome = isPersonDocumentCategory(request.category) || home === now.propertyId;
    if (request.category === now.category && sameHome) continue;
    const [open] = await openRequestsFor(tx, request.customerId, { ...request, propertyId: home });
    if (open) await closeSuperseded(tx, userId, request, open.id);
    else
      await reopenRequest(tx, userId, request, {
        note: FILED_ELSEWHERE,
        removePaper: false,
        quiet,
      });
  }
}

async function closeSuperseded(
  tx: DatabaseExecutor,
  userId: string | null,
  request: DocumentRequest,
  newerId: string,
) {
  const now = new Date();
  await tx
    .update(customerActions)
    .set({ status: 'cancelled', documentId: null, cancelledAt: now, updatedAt: now })
    .where(
      and(
        eq(customerActions.id, request.id),
        inArray(customerActions.status, ['received', 'closed']),
      ),
    );
  await logAction(tx, request, {
    kind: 'document_request',
    message: `Request for ${request.title} closed: paper filed on another home; newer request open`,
    userId,
    data: { customerActionId: request.id, documentId: request.documentId, newerId },
  });
  await recordAudit(tx, userId, 'customer_action.superseded', 'customer_action', request.id, {
    documentId: request.documentId,
    newerId,
  });
}
