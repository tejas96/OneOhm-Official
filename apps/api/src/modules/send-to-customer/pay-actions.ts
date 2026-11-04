import { customerActions, type DatabaseExecutor } from '@oneohm/database';
import { and, inArray, sql } from 'drizzle-orm';

/**
 * The customer's proof arrived (form or chat): the open `pay` actions for the instalment (or
 * all the customer's, when the proof names none) wait for finance. `filed` is the proof paper.
 */
export async function proofReceived(
  tx: DatabaseExecutor,
  customerId: string,
  milestoneId: string | null,
  detail: { documentId: string | null; amountPaise: number | null; paidOn: string | null },
): Promise<number> {
  const rows = await tx
    .update(customerActions)
    .set({
      status: 'received',
      doneAt: new Date(),
      updatedAt: new Date(),
      ...(detail.documentId ? { documentId: detail.documentId } : {}),
      payload: sql`${customerActions.payload} || ${JSON.stringify({ proof: detail })}::jsonb`,
    })
    .where(
      and(
        sql`${customerActions.customerId} = ${customerId}`,
        sql`${customerActions.type} = 'pay'`,
        sql`${customerActions.status} = 'open'`,
        milestoneId ? sql`${customerActions.payload}->>'milestoneId' = ${milestoneId}` : undefined,
      ),
    )
    .returning({ id: customerActions.id });
  return rows.length;
}

/**
 * Finance recorded a payment on the instalment: its `pay` actions are done. Paid in full
 * closes every one (the customer paid online or sent proof); a part payment closes only the
 * ones waiting for finance.
 */
export async function payRecorded(
  tx: DatabaseExecutor,
  milestoneId: string,
  fully: boolean,
): Promise<void> {
  await tx
    .update(customerActions)
    .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        sql`${customerActions.type} = 'pay'`,
        sql`${customerActions.payload}->>'milestoneId' = ${milestoneId}`,
        inArray(customerActions.status, fully ? ['open', 'received'] : ['received']),
      ),
    );
}
