import { type Database, notifyCover, notifyHolders } from '@oneohm/database';
import { unmatchedBody } from './paper-unmatched';

/** At 7 days the project manager (else those who manage projects) is told too, not only the asker. */
const MANAGER_AFTER = 7 * 86_400_000;

export interface WaitingRequest {
  readonly id: string;
  readonly title: string;
  readonly customer: string;
  readonly projectId: string | null;
  readonly requestedByUserId: string | null;
  readonly managerUserId: string | null;
  readonly round: number;
}

/**
 * The asker (else the project's manager) hears once per round, `unmatched` files to match; from 7 days the
 * project manager (else those who manage projects) hears too, once.
 */
export async function tellAsker(
  db: Database,
  request: WaitingRequest,
  unmatched: number,
  age: number,
) {
  const notice = {
    kind: 'paper_waiting',
    title: `Still waiting for ${request.title} from ${request.customer}`,
    body: unmatched
      ? unmatchedBody(request.customer, unmatched)
      : 'The customer was asked more than 4 days ago and has not sent it. Please call them.',
    ...(request.projectId ? { subject: { type: 'project' as const, id: request.projectId } } : {}),
    dedupeKey: `paper_waiting:${request.id}:${request.round}`,
  };
  const person = request.requestedByUserId ?? request.managerUserId;
  // Nobody to ask: those who manage projects hear, so it is never silent.
  if (person) await notifyCover(db, person, 'projects.manage', notice);
  else await notifyHolders(db, 'projects.manage', notice);
  if (age < MANAGER_AFTER) return;
  const escalation = {
    ...notice,
    body: `${request.customer} has not sent it for more than 7 days. Please follow it up.`,
    dedupeKey: `${notice.dedupeKey}:manager`,
  };
  const manager = request.managerUserId;
  if (manager && manager !== person) await notifyCover(db, manager, 'projects.manage', escalation);
  else await notifyHolders(db, 'projects.manage', escalation, person);
}
