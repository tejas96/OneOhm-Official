import type { ReferralReward } from '@oneohm/api-contracts';
import { customerActions, customers, type DatabaseExecutor } from '@oneohm/database';
import { inArray, sql } from 'drizzle-orm';

const onceOf = (rewardId: string) => `payout:${rewardId}`;

/** The UPI side of each reward row: what the customer shared, whether it was checked, the ask's state. */
export async function upiRows(
  db: DatabaseExecutor,
  rewards: readonly { id: string; paidUpiId: string | null; customerId: string }[],
): Promise<Map<string, ReferralReward['upi']>> {
  const out = new Map<string, ReferralReward['upi']>();
  if (rewards.length === 0) return out;
  const asks = await db
    .select({
      once: sql<string>`${customerActions.payload}->>'once'`,
      status: customerActions.status,
    })
    .from(customerActions)
    .where(
      inArray(
        sql`${customerActions.payload}->>'once'`,
        rewards.map((r) => onceOf(r.id)),
      ),
    );
  const people = await db
    .select({ id: customers.id, upiId: customers.upiId, checkedAt: customers.upiCheckedAt })
    .from(customers)
    .where(inArray(customers.id, [...new Set(rewards.map((r) => r.customerId))]));
  for (const reward of rewards) {
    const person = people.find((p) => p.id === reward.customerId);
    const ask = asks.find((a) => a.once === onceOf(reward.id));
    out.set(reward.id, {
      id: person?.upiId ?? null,
      checked: Boolean(person?.checkedAt),
      ask: ask && ask.status !== 'cancelled' ? ask.status : 'none',
      paidTo: reward.paidUpiId,
    });
  }
  return out;
}
