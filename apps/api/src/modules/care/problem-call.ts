import { type DatabaseExecutor, serviceRequests } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { callPromise, callWhen } from './call-promise';
import { alertCall, openCallTask } from './call-task';
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
  const [request] = await db
    .select({ assignee: serviceRequests.assigneeUserId })
    .from(serviceRequests)
    .where(eq(serviceRequests.id, given.requestId));
  const person = await callerOfRequest(db, given.requestId, given.phone);
  const promise = callPromise(new Date(), given.timeZone);
  const what = PROBLEM_LISTS.en.what[given.kind];
  await openCallTask(db, {
    customerId: given.customerId,
    projectId: given.projectId,
    owner: person.id,
    title: `Call about the problem: ${what}`,
    reason: 'problem',
    once: `call:problem:${given.requestId}`,
    promise,
  });
  // The assignee heard when the request was raised; anyone else named in the promise is told now.
  if (person.id && person.id !== request?.assignee)
    await alertCall(db, {
      owner: person.id,
      projectId: given.projectId,
      title: `Call about a problem: ${what}`,
      body: `We told the customer you will call them ${callWhen(promise)}.`,
      key: `call_problem:${given.requestId}`,
    });
  return { name: person.name, when: callWhen(promise) };
}
