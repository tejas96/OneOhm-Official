import {
  customerActions,
  customers,
  type DatabaseExecutor,
  documents,
  notify,
} from '@oneohm/database';
import { nextActionStatus } from '@oneohm/domain';
import { and, eq, isNull } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { AppError, conflict } from '../../common/http/errors';
import { tellWaitingOwners } from '../customer-portal/tell-waiting-owners';
import { logAction } from './customer-action-log';
import { openRequestsFor, reaskCount, roundKey } from './document-request-home';
import { tellReceivedByTeam } from './document-request-messages';

/**
 * The request is answered with this document: logged on the project (or the lead), its
 * asker and the owners of tasks waiting on the customer told (not the person who filed
 * it), audited. A paper the customer sends is `received` and waits for the team's check; a
 * staff upload is checked on upload, so the request closes at once. `said` is the log line
 * and alert title ("Ramesh sent Electricity bill"). Returns how many times it was asked
 * again, so the caller tells the customer once per round.
 */
export async function markRequestReceived(
  tx: DatabaseExecutor,
  asked: typeof customerActions.$inferSelect,
  documentId: string,
  by: { readonly userId: string | null; readonly said: string },
): Promise<number> {
  const id = asked.id;
  const now = new Date();
  const status = nextActionStatus('paper', 'open', by.userId ? 'staff_did_it' : 'customer_did_it');
  // Of two answers at once, only one is filed; the other rolls back.
  const [claimed] = await tx
    .update(customerActions)
    .set({
      status: status ?? 'received',
      documentId,
      doneAt: now,
      closedAt: status === 'closed' ? now : null,
      updatedAt: now,
    })
    .where(and(eq(customerActions.id, id), eq(customerActions.status, 'open')))
    .returning({ id: customerActions.id });
  if (!claimed) throw conflict('You have already sent this. Thank you.', 'received');
  // A paper the team files has been looked at by them.
  if (by.userId)
    await tx
      .update(documents)
      .set({ checkedAt: now, checkedByUserId: by.userId })
      .where(and(eq(documents.id, documentId), isNull(documents.checkedAt)));
  const reasks = await reaskCount(tx, id);
  const dedupeKey = roundKey(`document_received:${id}`, reasks);
  await logAction(tx, asked, {
    kind: 'document_received',
    message: by.said,
    userId: by.userId,
    data: { customerActionId: id, documentId },
  });
  if (asked.requestedByUserId && asked.requestedByUserId !== by.userId) {
    await notify(
      tx,
      { userId: asked.requestedByUserId },
      {
        kind: 'document_received',
        title: by.said,
        body: by.userId
          ? 'It is filed in the project documents.'
          : 'It is filed in the project documents. Please check it.',
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
  await recordAudit(tx, by.userId, 'customer_action.answered', 'customer_action', id, {
    documentId,
  });
  return reasks;
}

/**
 * A staff upload of a paper the customer was asked for (given by hand, by email, on a
 * site visit) closes that home's oldest open request for it, or the person's for an ID or
 * income paper (the upload is checked, so nothing is left to check), and the customer is told in the app (papers per home, flow 4 and D). A
 * contractor's or vendor's own paper has no customer and closes nothing; a paper of kind
 * "other" closes nothing either (its request title is free text, so the kind proves nothing).
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
  if (!paper.customerId || paper.category === 'other') return;
  const [open] = await openRequestsFor(tx, paper.customerId, paper);
  if (!open) return;
  const [row] = await tx
    .select({ asked: customerActions, phone: customers.phoneE164 })
    .from(customerActions)
    .innerJoin(customers, eq(customers.id, customerActions.customerId))
    .where(eq(customerActions.id, open.id))
    .limit(1);
  if (!row) return;
  const { asked, phone } = row;
  const said = `${asked.title} received: ${by.fullName} added it`;
  try {
    // A savepoint: if the customer answered it a moment ago, the staff file still saves.
    await tx.transaction(async (savepoint) => {
      const filer = { userId: by.userId, said };
      const reasks = await markRequestReceived(savepoint, asked, documentId, filer);
      await tellReceivedByTeam(savepoint, { ...asked, phone }, reasks);
    });
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'received')) throw error;
  }
}
