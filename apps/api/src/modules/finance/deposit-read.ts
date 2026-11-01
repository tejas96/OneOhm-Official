import type { CashPosition, HandledPayment, MoneyDeposit } from '@oneohm/api-contracts';
import { type DatabaseExecutor, moneyDeposits, paymentHandling, users } from '@oneohm/database';
import { desc, eq, sql } from 'drizzle-orm';

/** Every deposit slip, newest first, with how many payments it carried. */
export async function readDeposits(db: DatabaseExecutor): Promise<MoneyDeposit[]> {
  const rows = await db
    .select({
      deposit: moneyDeposits,
      by: users.fullName,
      items: sql<number>`(select count(*)::int from ${paymentHandling} where ${paymentHandling.depositId} = ${moneyDeposits.id})`,
    })
    .from(moneyDeposits)
    .leftJoin(users, eq(users.id, moneyDeposits.depositedByUserId))
    .orderBy(desc(moneyDeposits.depositedOn), desc(moneyDeposits.createdAt));
  return rows.map(({ deposit, by, items }) => ({
    id: deposit.id,
    number: deposit.number,
    depositedOn: deposit.depositedOn,
    bankReference: deposit.bankReference,
    cashPaise: deposit.cashPaise,
    chequePaise: deposit.chequePaise,
    note: deposit.note,
    depositedBy: by,
    items,
    createdAt: deposit.createdAt.toISOString(),
  }));
}

/** Cash in hand per person who collected it, the largest first. */
export function collectorsOf(cash: readonly HandledPayment[]): CashPosition['collectors'] {
  const groups = new Map<string, CashPosition['collectors'][number]>();
  for (const item of cash) {
    const key = item.collectedBy?.id ?? 'unknown';
    const current = groups.get(key) ?? {
      userId: item.collectedBy?.id ?? null,
      name: item.collectedBy?.name ?? null,
      totalPaise: 0,
      count: 0,
      oldestDays: 0,
    };
    groups.set(key, {
      ...current,
      totalPaise: current.totalPaise + item.amountPaise,
      count: current.count + 1,
      oldestDays: Math.max(current.oldestDays, item.daysHeld),
    });
  }
  return [...groups.values()].sort((a, b) => b.totalPaise - a.totalPaise);
}
