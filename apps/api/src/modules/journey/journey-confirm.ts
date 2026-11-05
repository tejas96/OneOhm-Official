import { customerActions, customers, type Database, homeNameOf } from '@oneohm/database';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { logAction } from '../documents/customer-action-log';
import {
  alertManager,
  alertTaskOwner,
  resumeAfterWait,
  taskFor,
  waitOnCustomer,
} from './journey-store';

/** What an answer to a roof or installation question came to. */
export type Confirmed =
  | { readonly kind: 'old' }
  | { readonly kind: 'yes' }
  | { readonly kind: 'notYet' }
  | { readonly kind: 'now' }
  /** The installation is not right: the problem report starts for this project. */
  | { readonly kind: 'bad'; readonly projectId: string | null; readonly home: string };

export type ConfirmAnswer = 'yes' | 'not_yet' | 'now' | 'bad';

/**
 * The customer's answer to "Is the roof ready?" or "Is the installation finished?" (redesign §4):
 * logged with the answer. Roof "Not yet" keeps the ask open, sets the dispatch step waiting on the
 * customer (the existing wait) and tells its owner; "It's ready now" closes it and opens the step
 * again. Installation "Something is wrong" tells the project manager and starts a problem report.
 * Tapping twice changes nothing more.
 */
export function answerConfirm(
  db: Database,
  customerId: string,
  actionId: string,
  kind: 'site_ready' | 'installation',
  answer: ConfirmAnswer,
): Promise<Confirmed> {
  return db.transaction(async (tx): Promise<Confirmed> => {
    const [action] = await tx
      .select()
      .from(customerActions)
      .where(
        and(
          eq(customerActions.id, actionId),
          eq(customerActions.customerId, customerId),
          eq(customerActions.type, 'confirm'),
          eq(customerActions.status, 'open'),
        ),
      )
      .for('update');
    if (!action || action.payload.kind !== kind) return { kind: 'old' };
    const [customer] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(eq(customers.id, customerId));
    const task = action.taskId ? await taskFor(tx, action.taskId) : null;
    const home = await homeNameOf(tx, action.projectId);
    const who = customer?.name ?? 'The customer';
    const asked = action.payload.answer === 'not_yet';
    const now = new Date();
    const record = async (answered: string, line: string, close: boolean) => {
      await tx
        .update(customerActions)
        .set({
          payload: { ...action.payload, answer: answered, answeredAt: now.toISOString() },
          doneAt: now,
          updatedAt: now,
          ...(close ? { status: 'closed' as const, closedAt: now } : {}),
        })
        .where(eq(customerActions.id, action.id));
      await logAction(tx, action, {
        kind: 'customer_action',
        message: line,
        userId: null,
        data: { customerActionId: action.id, answer: answered },
      });
      await recordAudit(tx, null, 'customer_action.answered', 'customer_action', action.id, {
        answer: answered,
      });
    };
    if (answer === 'not_yet') {
      if (asked) return { kind: 'notYet' };
      await record('not_yet', `${who} said the roof at ${home} is not ready yet (WhatsApp)`, false);
      if (task) {
        await waitOnCustomer(tx, task, 'roof not ready');
        await alertTaskOwner(tx, task, {
          kind: 'site_not_ready',
          title: `Roof not ready at ${home}`,
          body: `${who} said the roof is not ready. ${task.title} now waits on the customer.`,
          key: `site_not_ready:${action.id}`,
        });
      }
      return { kind: 'notYet' };
    }
    if (answer === 'bad') {
      await record(
        'problem',
        `${who} says the installation at ${home} is not right (WhatsApp)`,
        true,
      );
      if (action.projectId)
        await alertManager(tx, action.projectId, {
          kind: 'installation_not_ok',
          title: `${who} says the installation is not right`,
          body: `${home}: they are reporting a problem on WhatsApp. Please call them.`,
          key: `installation_not_ok:${action.id}`,
        });
      return { kind: 'bad', projectId: action.projectId, home };
    }
    const line =
      kind === 'site_ready'
        ? `${who} confirmed the roof at ${home} is ready (WhatsApp)`
        : `${who} confirmed the installation at ${home} is finished (WhatsApp)`;
    await record(answer === 'now' ? 'ready_now' : 'yes', line, true);
    if (task && asked) {
      await resumeAfterWait(tx, task);
      await alertTaskOwner(tx, task, {
        kind: 'site_ready_now',
        title: `Roof is ready at ${home}`,
        body: `${who} says the roof is ready now. ${task.title} is open again.`,
        key: `site_ready_now:${action.id}`,
      });
    }
    return { kind: asked ? 'now' : 'yes' };
  });
}
