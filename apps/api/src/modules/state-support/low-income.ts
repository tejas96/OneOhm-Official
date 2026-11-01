import { type DatabaseExecutor, properties } from '@oneohm/database';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { Actor } from '../../common/auth/actor';
import { notFound } from '../../common/http/errors';

/**
 * A low-income household (PRD 3.5): the state top-up may apply to this home. Staff set it
 * once the proof (ration card or income certificate) is filed as Income proof, or clear a
 * mistake; either way it is audited and the live price picks it up at once.
 */
export async function setLowIncome(
  db: DatabaseExecutor,
  actor: Actor,
  propertyId: string,
  lowIncome: boolean,
): Promise<{ lowIncomeHousehold: boolean }> {
  const [row] = await db
    .update(properties)
    .set({ lowIncomeHousehold: lowIncome, updatedAt: new Date() })
    .where(eq(properties.id, propertyId))
    .returning({ lowIncomeHousehold: properties.lowIncomeHousehold });
  if (!row) throw notFound('That property');
  await recordAudit(db, actor.userId, 'property.low_income', 'property', propertyId, {
    lowIncome,
  });
  return row;
}
