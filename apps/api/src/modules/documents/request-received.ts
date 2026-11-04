import {
  customers,
  type DatabaseExecutor,
  documentRequests,
  notify,
  projectActivities,
} from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { conflict } from '../../common/http/errors';
import { tellWaitingOwners } from '../customer-portal/tell-waiting-owners';
import { openRequestsFor, reaskCount, roundKey } from './document-request-home';
import { tellReceivedByTeam } from './document-request-messages';

/**
 * The request is received with this document: logged on the project, its asker and the
 * owners of tasks waiting on the customer told (not the person who filed it), audited.
 * `said` is the log line and alert title ("Ramesh sent Electricity bill"). Returns how
 * many times it was asked again, so the caller tells the customer once per round.
 */
export async function markRequestReceived(
  tx: DatabaseExecutor,
  asked: typeof documentRequests.$inferSelect,
  documentId: string,
  by: { readonly userId: string | null; readonly said: string },
): Promise<number> {
  const id = asked.id;
  const now = new Date();
  // Of two answers at once, only one is filed; the other rolls back.
  const [claimed] = await tx
    .update(documentRequests)
    .set({ status: 'received', documentId, receivedAt: now, updatedAt: now })
    .where(and(eq(documentRequests.id, id), eq(documentRequests.status, 'open')))
    .returning({ id: documentRequests.id });
  if (!claimed) throw conflict('You have already sent this. Thank you.', 'received');
  const reasks = await reaskCount(tx, id);
  const dedupeKey = roundKey(`document_received:${id}`, reasks);
  if (asked.projectId)
    await tx.insert(projectActivities).values({
      projectId: asked.projectId,
      kind: 'document_received',
      message: by.said,
      userId: by.userId,
      data: { documentRequestId: id, documentId },
    });
  if (asked.requestedByUserId && asked.requestedByUserId !== by.userId) {
    await notify(
      tx,
      { userId: asked.requestedByUserId },
      {
        kind: 'document_received',
        title: by.said,
        body: 'It is filed in the project documents.',
        ...(asked.projectId
          ? { subject: { type: 'project', id: asked.projectId, projectId: asked.projectId } }
          : {}),
        dedupeKey,
      },
    );
  }
  if (asked.projectId)
    await tellWaitingOwners(tx, asked.projectId, {
      title: by.said,
      dedupeKey,
      except: [by.userId, asked.requestedByUserId],
    });
  await recordAudit(tx, by.userId, 'document_request.answered', 'document_request', id, {
    documentId,
  });
  return reasks;
}

/**
 * A staff upload of a paper the customer was asked for (given by hand, by email, on a
 * site visit) closes that home's oldest open request for it, or the person's for an ID or
 * income paper, and the customer is told in the app (papers per home, flow 4 and D). A
 * contractor's or vendor's own paper has no customer and closes nothing.
 */
export async function closeRequestWithUpload(
  tx: DatabaseExecutor,
  by: { readonly userId: string; readonly fullName: string },
  documentId: string,
  paper: {
    readonly customerId: string | null;
    readonly propertyId: string | null;
    readonly category: string;
  },
): Promise<void> {
  if (!paper.customerId) return;
  const [open] = await openRequestsFor(tx, paper.customerId, paper);
  if (!open) return;
  const [row] = await tx
    .select({ asked: documentRequests, phone: customers.phoneE164 })
    .from(documentRequests)
    .innerJoin(customers, eq(customers.id, documentRequests.customerId))
    .where(eq(documentRequests.id, open.id))
    .limit(1);
  if (!row) return;
  const { asked, phone } = row;
  const said = `${asked.title} received: ${by.fullName} added it`;
  const reasks = await markRequestReceived(tx, asked, documentId, { userId: by.userId, said });
  await tellReceivedByTeam(tx, { ...asked, phone }, reasks);
}
