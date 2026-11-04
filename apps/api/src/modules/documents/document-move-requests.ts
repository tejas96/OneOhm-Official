import type { DocumentRequest } from '@oneohm/api-contracts';
import {
  type DatabaseExecutor,
  documentRequests,
  leads,
  projectActivities,
} from '@oneohm/database';
import { isPersonDocumentCategory } from '@oneohm/domain';
import { and, eq, notInArray } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logLead } from '../crm/lead-history';
import { propertyOfProject } from './document-links';
import { openRequestsFor } from './document-request-home';
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
  userId: string,
  documentId: string,
  now: { readonly propertyId: string | null; readonly category: string },
): Promise<void> {
  const answered = await readRequests(
    tx,
    and(eq(documentRequests.documentId, documentId), eq(documentRequests.status, 'received')),
  );
  for (const request of answered) {
    const home = await propertyOfProject(tx, request.projectId);
    const sameHome = isPersonDocumentCategory(request.category) || home === now.propertyId;
    if (request.category === now.category && sameHome) continue;
    const [open] = await openRequestsFor(tx, request.customerId, { ...request, propertyId: home });
    if (open) await closeSuperseded(tx, userId, request, open.id);
    else await reopenRequest(tx, userId, request, { note: FILED_ELSEWHERE, removePaper: false });
  }
}

async function closeSuperseded(
  tx: DatabaseExecutor,
  userId: string,
  request: DocumentRequest,
  newerId: string,
) {
  const now = new Date();
  await tx
    .update(documentRequests)
    .set({ status: 'cancelled', documentId: null, cancelledAt: now, updatedAt: now })
    .where(and(eq(documentRequests.id, request.id), eq(documentRequests.status, 'received')));
  if (request.projectId)
    await tx.insert(projectActivities).values({
      projectId: request.projectId,
      kind: 'document_request',
      message: `Request for ${request.title} closed: paper filed on another home; newer request open`,
      userId,
      data: { documentRequestId: request.id, documentId: request.documentId, newerId },
    });
  await recordAudit(tx, userId, 'document_request.superseded', 'document_request', request.id, {
    documentId: request.documentId,
    newerId,
  });
}
