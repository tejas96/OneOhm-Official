import {
  customerActions,
  type DatabaseExecutor,
  notifyCover,
  notifyHolders,
} from '@oneohm/database';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import type { CallPromise } from './call-promise';

export type CallReason = 'problem' | 'low_rating' | 'reopened' | 'quote' | 'amc' | 'no_project';

/**
 * The call a customer was promised (redesign §12, §13): a call-back ask that is already answered
 * ("To call"), with the time it is late (`callBy`). Staff close it with Called; when it is missed the
 * worker tells the person, then the service desk (queueCallTasks). `once` makes it one per cause.
 */
export async function openCallTask(
  tx: DatabaseExecutor,
  given: {
    readonly customerId: string;
    readonly projectId: string | null;
    readonly owner: string | null;
    readonly title: string;
    readonly reason: CallReason;
    readonly once: string;
    readonly promise: CallPromise;
  },
): Promise<string | null> {
  const [row] = await tx
    .insert(customerActions)
    .values({
      type: 'callback',
      customerId: given.customerId,
      projectId: given.projectId,
      title: given.title,
      status: 'received',
      doneAt: new Date(),
      requestedByUserId: given.owner,
      payload: {
        kind: 'call_task',
        reason: given.reason,
        callBy: given.promise.by.toISOString(),
        owner: given.owner,
        once: given.once,
      },
    })
    .onConflictDoNothing()
    .returning({ id: customerActions.id });
  if (!row) return null;
  await logAction(
    tx,
    { projectId: given.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Call task: ${given.title}`,
      userId: null,
      data: { customerActionId: row.id },
    },
  );
  await recordAudit(tx, null, 'customer_action.created', 'customer_action', row.id, {
    type: 'callback',
    reason: given.reason,
  });
  return row.id;
}

/** Tells the person to call (or the service desk when nobody owns it): one alert per key. */
export async function alertCall(
  tx: DatabaseExecutor,
  given: {
    readonly owner: string | null;
    readonly projectId: string | null;
    readonly title: string;
    readonly body: string;
    readonly key: string;
  },
): Promise<void> {
  const notice = {
    kind: 'call_customer',
    title: given.title,
    body: given.body,
    ...(given.projectId ? { subject: { type: 'project' as const, id: given.projectId } } : {}),
    dedupeKey: given.key,
  };
  if (given.owner) await notifyCover(tx, given.owner, 'service.manage', notice);
  else await notifyHolders(tx, 'service.manage', notice);
}
