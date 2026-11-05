import { holdersOf, payables, users } from '@oneohm/database';
import { secondPersonText } from '@oneohm/domain';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../../config/core.module';

/** Active people with a right, by name, leaving out one person (the sender). */
async function namesOf(db: Database, ids: readonly string[], except: string): Promise<string[]> {
  const wanted = [...new Set(ids)].filter((id) => id !== except);
  if (wanted.length === 0) return [];
  const rows = await db
    .select({ name: users.fullName })
    .from(users)
    .where(inArray(users.id, wanted));
  return rows.map((row) => row.name).sort();
}

/**
 * The refusal text for a missing second person, naming who can help: those who record or
 * approve payments can press Ask to send; other approvers can send it.
 */
export async function secondPersonMessage(
  db: Database,
  limitPaise: number,
  senderId: string,
): Promise<string> {
  const [approvers, recorders] = await Promise.all([
    holdersOf(db, 'finance.approve_payments'),
    holdersOf(db, 'finance.record_payments'),
  ]);
  const [askNames, sendNames] = await Promise.all([
    namesOf(db, [...approvers, ...recorders], senderId),
    namesOf(db, approvers, senderId),
  ]);
  return secondPersonText(limitPaise, askNames, sendNames);
}

/** Who approved the bill (null when nobody has). */
export async function approverOf(db: Database, payableId: string): Promise<string | null> {
  const [bill] = await db
    .select({ by: payables.approvedByUserId })
    .from(payables)
    .where(eq(payables.id, payableId));
  return bill?.by ?? null;
}
