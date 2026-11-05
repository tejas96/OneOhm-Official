import { type DatabaseExecutor, serviceRequests } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { callPromise, callWhen } from './call-promise';
import { openCallTask } from './call-task';
import { callerFor } from './care-person';
import type { ProblemKind } from './care-taps';
import { PROBLEM_LISTS } from './problem-words';

/** Who looks after a service request for the customer: its assignee, else the project's person, else the desk. */
export async function callerOfRequest(db: DatabaseExecutor, requestId: string, phone: string) {
  const [row] = await db
    .select({ assignee: serviceRequests.assigneeUserId, projectId: serviceRequests.projectId })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, requestId));
  return callerFor(db, {
    assignee: row?.assignee ?? null,
    projectId: row?.projectId ?? null,
    phone,
  });
}

/**
 * The call promised for a new problem (redesign §12): who calls, and when in the customer's words, with the
 * call task behind the promise (the worker escalates it when missed).
 */
export async function promiseProblemCall(
  db: DatabaseExecutor,
  given: {
    readonly customerId: string;
    readonly requestId: string;
    readonly projectId: string | null;
    readonly kind: ProblemKind;
    readonly phone: string;
    readonly timeZone: string;
  },
): Promise<{ readonly name: string | null; readonly when: string }> {
  const person = await callerOfRequest(db, given.requestId, given.phone);
  const promise = callPromise(new Date(), given.timeZone);
  await openCallTask(db, {
    customerId: given.customerId,
    projectId: given.projectId,
    owner: person.id,
    title: `Call about the problem: ${PROBLEM_LISTS.en.what[given.kind]}`,
    reason: 'problem',
    once: `call:problem:${given.requestId}`,
    promise,
  });
  return { name: person.name, when: callWhen(promise) };
}
