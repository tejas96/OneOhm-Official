import {
  categoryHours,
  customerActions,
  customers,
  type Database,
  type DatabaseExecutor,
  notify,
  notifyHolders,
  serviceRequests,
} from '@oneohm/database';
import { slaDueDates } from '@oneohm/domain';
import { and, eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { queueWhatsApp } from '../../common/outbox';
import { logAction } from '../documents/customer-action-log';
import { assistantLanguage, inLanguage } from '../whatsapp/assistant/language';
import { CATEGORY_WORDS } from '../whatsapp/assistant/words';
import { callPromise, callWhen } from './call-promise';
import { openCallTask } from './call-task';
import { deliverCare } from './care-deliver';
import { callerFor } from './care-person';
import { careTaps } from './care-taps';
import { PROBLEM_WORDS } from './problem-words';

/**
 * A problem is resolved (by the desk or the technician): "Fixed ✅ Is it working now?" with [Yes,
 * working] [Still a problem] (redesign §12). Inside 24 hours the chat message, else the template
 * `problem_fixed_check`; while that template is off the customer still hears the older "resolved"
 * update, as before. One check per fix: a request reopened and fixed again is asked again.
 */
export async function tellFixed(
  tx: DatabaseExecutor,
  request: { readonly id: string; readonly topicWords?: string },
  now: Date,
): Promise<void> {
  const [row] = await tx
    .select({
      customerId: serviceRequests.customerId,
      projectId: serviceRequests.projectId,
      category: serviceRequests.category,
      name: customers.name,
      phone: customers.phoneE164,
      language: customers.preferredLanguage,
    })
    .from(serviceRequests)
    .innerJoin(customers, eq(customers.id, serviceRequests.customerId))
    .where(eq(serviceRequests.id, request.id));
  if (!row) return;
  const topic = request.topicWords ?? CATEGORY_WORDS[row.category] ?? row.category;
  const [made] = await tx
    .insert(customerActions)
    .values({
      type: 'confirm',
      customerId: row.customerId,
      projectId: row.projectId,
      title: `Is it working now? ${topic}`,
      payload: {
        kind: 'problem_fixed',
        topic,
        requestId: request.id,
        // One check per resolve: reopened (by the customer or by staff) and resolved again asks again.
        once: `fixed:${request.id}:${now.getTime()}`,
      },
    })
    .onConflictDoNothing()
    .returning({ id: customerActions.id });
  if (!made) return;
  await logAction(
    tx,
    { projectId: row.projectId, leadId: null },
    {
      kind: 'customer_action',
      message: `Asked the customer whether the problem is fixed (${topic})`,
      userId: null,
      data: { customerActionId: made.id },
    },
  );
  const id = made.id;
  const wording = await inLanguage(
    assistantLanguage(row.language),
    async () => CATEGORY_WORDS[row.category] ?? row.category,
  );
  await deliverCare(tx, row, {
    template: 'problem_fixed_check',
    payload: {
      customer: row.name.split(/\s+/)[0] ?? row.name,
      topic: wording,
      yesPayload: careTaps.fixedYes(id),
      stillPayload: careTaps.fixedNo(id),
    },
    key: `fixed_check:${id}`,
    reply: async () => ({
      kind: 'buttons',
      body: PROBLEM_WORDS.fixed(CATEGORY_WORDS[row.category] ?? row.category),
      buttons: [
        { id: careTaps.fixedYes(id), title: PROBLEM_WORDS.yes },
        { id: careTaps.fixedNo(id), title: PROBLEM_WORDS.still },
      ],
    }),
    // The template is not approved yet: the customer still hears it is resolved, as before.
    fallback: () =>
      queueWhatsApp(
        tx,
        row.phone,
        'service_update',
        { customer: row.name, topic, status: 'resolved' },
        `service:${request.id}:resolved:${now.getTime()}`,
      ),
  });
}

export type Reopened =
  | { readonly kind: 'old' }
  | { readonly kind: 'ok'; readonly requestId: string; readonly projectId: string | null }
  | {
      readonly kind: 'reopened';
      readonly name: string | null;
      readonly when: string;
    };

/**
 * The customer's answer to "Is it working now?". Yes closes the check (the rating follows); Still a
 * problem reopens the request: status open, the response clock starts again, the person on it is told and
 * the promised call is made a task, all in one transaction. A check that no longer fits (the request is not
 * resolved any more) is "old" and is left as it was. Tapping again changes nothing (closed once).
 */
export function answerFixed(
  db: Database,
  customerId: string,
  actionId: string,
  working: boolean,
  given: { readonly timeZone: string; readonly phone: string },
): Promise<Reopened> {
  return db.transaction(async (tx): Promise<Reopened> => {
    const [ask] = await tx
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
    if (ask?.payload.kind !== 'problem_fixed') return { kind: 'old' };
    const requestId = String(ask.payload.requestId);
    const [request] = await tx
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId))
      .for('update');
    // Reopening needs a resolved request; if it is not, nothing is closed and nothing changes.
    if (!request || (!working && request.status !== 'resolved')) return { kind: 'old' };
    const now = new Date();
    const answer = working ? 'yes' : 'still';
    await tx
      .update(customerActions)
      .set({
        status: 'closed',
        doneAt: now,
        closedAt: now,
        updatedAt: now,
        payload: { ...ask.payload, answer },
      })
      .where(eq(customerActions.id, ask.id));
    await recordAudit(tx, null, 'customer_action.answered', 'customer_action', ask.id, { answer });
    if (working) {
      await logAction(tx, ask, {
        kind: 'customer_action',
        message: 'The customer says the problem is fixed (WhatsApp)',
        userId: null,
        data: { customerActionId: ask.id },
      });
      return { kind: 'ok', requestId, projectId: ask.projectId };
    }
    const hours = await categoryHours(tx, request.category);
    const due = hours ? slaDueDates(hours, now) : null;
    await tx
      .update(serviceRequests)
      .set({
        status: 'open',
        respondedAt: null,
        resolvedAt: null,
        responseDueAt: due?.responseDueAt ?? null,
        resolutionDueAt: due?.resolutionDueAt ?? null,
        reopenCount: request.reopenCount + 1,
        reopenedAt: now,
        updatedAt: now,
      })
      .where(eq(serviceRequests.id, requestId));
    await recordAudit(tx, null, 'service.reopened', 'service_request', requestId, {
      by: 'customer',
      reopenCount: request.reopenCount + 1,
    });
    await logAction(tx, ask, {
      kind: 'customer_action',
      message: 'The customer says it is still a problem: the request is open again (WhatsApp)',
      userId: null,
      data: { customerActionId: ask.id },
    });
    const notice = {
      kind: 'service_reopened',
      title: 'Problem reopened: the customer says it is still a problem',
      body: `${request.description.slice(0, 120)}. Please call them.`,
      subject: { type: 'service_request' as const, id: requestId, projectId: request.projectId },
      dedupeKey: `service_reopened:${requestId}:${request.reopenCount + 1}`,
    };
    if (request.assigneeUserId) await notify(tx, { userId: request.assigneeUserId }, notice);
    await notifyHolders(tx, 'service.manage', notice);
    const person = await callerFor(tx, {
      assignee: request.assigneeUserId,
      projectId: request.projectId,
      phone: given.phone,
    });
    const promise = callPromise(now, given.timeZone);
    await openCallTask(tx, {
      customerId,
      projectId: request.projectId,
      owner: person.id,
      title: `Call about the reopened problem: ${request.description.slice(0, 80)}`,
      reason: 'reopened',
      once: `call:reopened:${ask.id}`,
      promise,
    });
    return { kind: 'reopened', name: person.name, when: callWhen(promise) };
  });
}
