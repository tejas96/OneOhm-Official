import type { DocumentRequest } from '@oneohm/api-contracts';
import {
  customerActions,
  customerHandovers,
  type Database,
  type DatabaseExecutor,
} from '@oneohm/database';
import { type Capability, inPersonClose, nextActionStatus, rightsForAsk } from '@oneohm/domain';
import { and, eq, isNull, like, or } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import { type Actor, can } from '../../common/auth/actor';
import { conflict, forbidden, invalid } from '../../common/http/errors';
import { answerConfirm } from '../journey/journey-confirm';
import { logAction } from './customer-action-log';

/**
 * The team did an ask in person with a customer who is not on WhatsApp. A plain ask closes; the roof and
 * installation questions take the Yes / Not yet answer (the customer's own handler); an ask that needs its
 * own step (a payment, a visit day, a signed copy...) is refused and says which step. The team's task for
 * it is ticked, and the project log and the audit trail say who did it.
 */
export async function closeInPerson(
  db: Database,
  actor: Actor,
  request: DocumentRequest,
  answer?: 'yes' | 'not_yet',
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
  const how = inPersonClose(request.type, request.kind);
  if (how.how === 'hint') throw conflict(how.hint, 'record_first');
  if (how.how === 'confirm') {
    if (!answer)
      throw invalid('Say whether the answer is Yes or Not yet.', { answer: 'Required.' });
    // "Not yet" is the roof question's answer (the step waits on the customer); an installation that
    // is not finished is a problem to report, not a pause.
    if (answer === 'not_yet' && how.kind === 'installation')
      throw invalid('Not yet does not apply to the installation question.', {
        answer:
          'Answer Yes when the installation is finished; otherwise report the problem on the project.',
      });
    // The answer and the tick of the team's task stand or fall together.
    const done = await db.transaction(async (tx) => {
      const result = await answerConfirm(tx, request.customerId, request.id, how.kind, answer, {
        userId: actor.userId,
      });
      // The answer wrote its own log line and audit row ("in person", by this user); "Not yet"
      // keeps the ask and its task open, and asking again adds nothing.
      if (result.kind === 'yes' || result.kind === 'now') {
        await tickTask(tx, actor.userId, request);
        await recordAudit(
          tx,
          actor.userId,
          'customer_action.done_in_person',
          'customer_action',
          request.id,
        );
      }
      return result;
    });
    if (done.kind === 'old') throw conflict('That question was already answered.', 'answered');
    return;
  }
  await db.transaction((tx) => closePlain(tx, actor.userId, request));
}

/** Closes a plain ask done in person (also when the team ticks its task on the handovers list). */
export async function closePlain(
  tx: DatabaseExecutor,
  userId: string,
  request: DocumentRequest,
): Promise<void> {
  const now = new Date();
  await tx
    .update(customerActions)
    .set({ status: 'closed', doneAt: now, closedAt: now, updatedAt: now })
    .where(and(eq(customerActions.id, request.id), eq(customerActions.status, 'open')));
  await note(tx, userId, request);
}

/** Ticks the team's task made with the ask. */
async function tickTask(tx: DatabaseExecutor, userId: string, request: DocumentRequest) {
  await tx
    .update(customerHandovers)
    .set({ doneAt: new Date(), doneByUserId: userId, note: 'Done in person' })
    .where(
      and(
        // The task points at its ask; a staff-sent one's key is `send:<action>:<ask id>:<press id>`.
        or(
          eq(customerHandovers.actionId, request.id),
          like(customerHandovers.dedupeKey, `send:%:${request.id}:%`),
        ),
        isNull(customerHandovers.doneAt),
      ),
    );
}

/** Ticks the task made with the ask, then the log line and the audit row. */
async function note(tx: DatabaseExecutor, userId: string, request: DocumentRequest): Promise<void> {
  await tickTask(tx, userId, request);
  await logAction(tx, request, {
    kind: 'document_request',
    message: `${request.title} done in person`,
    userId,
    data: { customerActionId: request.id },
  });
  await recordAudit(tx, userId, 'customer_action.done_in_person', 'customer_action', request.id);
}
