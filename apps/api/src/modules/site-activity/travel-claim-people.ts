import { type DatabaseExecutor, managerIdsOf } from '@oneohm/database';
import { isHrOrFinance, travelDeciderProblem } from '@oneohm/domain';
import type { Actor } from '../../common/auth/actor';
import { conflict, forbidden } from '../../common/http/errors';

/**
 * Only the person's manager (or whoever covers for them), HR or finance decide a travel
 * claim, never the person themselves (S10). Not any leave approver.
 */
export async function assertMayDecideClaim(
  db: DatabaseExecutor,
  actor: Actor,
  claimantId: string,
): Promise<void> {
  const managers = await managerIdsOf(db, [claimantId]);
  const problem = travelDeciderProblem({
    decider: { userId: actor.userId, capabilities: [...actor.capabilities] },
    claimantId,
    managerIds: managers.get(claimantId) ?? [],
  });
  if (problem === 'own') throw conflict('Someone else approves your own claim.', 'own');
  if (problem === 'not_allowed')
    throw forbidden('Only the person’s manager, HR or finance can decide this claim.');
}

/**
 * Voiding an approved claim undoes money, so only finance or HR may do it (S9, S10): a
 * reporting manager decides a waiting claim but cannot void an approved one. Never your own.
 */
export function assertMayVoidClaim(actor: Actor, claimantId: string): void {
  if (actor.userId === claimantId) throw conflict('Someone else approves your own claim.', 'own');
  if (!isHrOrFinance([...actor.capabilities]))
    throw forbidden('Only finance or HR can void an approved claim.');
}
