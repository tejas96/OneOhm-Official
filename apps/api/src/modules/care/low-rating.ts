import type { DatabaseExecutor } from '@oneohm/database';
import { callPromise, callWhen } from './call-promise';
import { alertCall, openCallTask } from './call-task';
import { callerFor } from './care-person';

/**
 * A rating of 1 or 2 stars, from WhatsApp or the app: the person who looks after the customer is
 * alerted and a call task is made with a promised time (redesign §13). Once per `key`. Returns who
 * calls and when, in the language being spoken.
 */
export async function lowRatingFollowUp(
  tx: DatabaseExecutor,
  given: {
    readonly customerId: string;
    readonly customerName: string;
    readonly phone: string;
    readonly projectId: string | null;
    readonly assignee: string | null;
    readonly label: string;
    readonly stars: number;
    readonly key: string;
    readonly timeZone: string;
  },
): Promise<{ readonly name: string | null; readonly when: string }> {
  const person = await callerFor(tx, {
    assignee: given.assignee,
    projectId: given.projectId,
    phone: given.phone,
  });
  const promise = callPromise(new Date(), given.timeZone);
  await openCallTask(tx, {
    customerId: given.customerId,
    projectId: given.projectId,
    owner: person.id,
    title: `Call ${given.customerName}: rated ${given.label} ${given.stars}/5`,
    reason: 'low_rating',
    once: `call:${given.key}`,
    promise,
  });
  await alertCall(tx, {
    owner: person.id,
    projectId: given.projectId,
    title: `Low rating: ${given.customerName} gave ${given.label} ${given.stars}/5`,
    body: `Please call them ${callWhen(promise)}.`,
    key: given.key.startsWith('rating_low:') ? given.key : `rating_low:${given.key}`,
  });
  return { name: person.name, when: callWhen(promise) };
}
