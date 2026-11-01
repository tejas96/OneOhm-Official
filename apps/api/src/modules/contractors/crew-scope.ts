import { contractorMembers, contractors, type DatabaseExecutor } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';
import { forbidden } from '../../common/http/errors';

/**
 * The contractor a signed-in crew member works for (PRD 4.9). Crew screens show only
 * this contractor's work, material and money; anyone else is turned away.
 */
export async function crewContractor(
  db: DatabaseExecutor,
  actor: Actor,
): Promise<{ id: string; name: string }> {
  if (!can(actor, 'work_orders.view_own')) throw forbidden();
  const [member] = await db
    .select({ id: contractors.id, name: contractors.name })
    .from(contractorMembers)
    .innerJoin(contractors, eq(contractors.id, contractorMembers.contractorId))
    .where(eq(contractorMembers.userId, actor.userId));
  if (!member) throw forbidden('You are not part of a contractor crew.');
  return member;
}
