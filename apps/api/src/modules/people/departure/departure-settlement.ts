import {
  commissionEntries,
  type DatabaseExecutor,
  holdersOf,
  payables,
  pointsEntries,
  projectBonuses,
  projectBonusShares,
  travelClaims,
} from '@oneohm/database';
import type { Capability } from '@oneohm/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';

export interface Owed {
  readonly count: number;
  readonly paise: number;
}

/** What the company still owes the person. Nothing here is cancelled or moved on removal. */
export interface Settlement {
  readonly travelClaims: Owed;
  readonly bonusShares: Owed;
  readonly payables: Owed;
  readonly commissions: Owed;
  /** Points still waiting for the manager's decision. */
  readonly pendingPoints: number;
}

/** Permissions whose last holder leaving leaves the company stuck. */
export const KEY_CAPABILITIES: readonly Capability[] = [
  'finance.approve_payments',
  'people.manage',
  'roles.manage',
];

const count = sql<number>`count(*)::int`;
const total = (amount: unknown) => sql<number>`coalesce(sum(${amount}), 0)::float8`;
const owed = (row: { count: number; paise: number } | undefined): Owed => ({
  count: row?.count ?? 0,
  paise: Math.round(row?.paise ?? 0),
});

export async function settlement(db: DatabaseExecutor, userId: string): Promise<Settlement> {
  const [[claims], [bonuses], [bills], [commissions], [points]] = await Promise.all([
    db
      .select({ count, paise: total(travelClaims.amountPaise) })
      .from(travelClaims)
      .where(
        and(eq(travelClaims.userId, userId), inArray(travelClaims.status, ['pending', 'approved'])),
      ),
    db
      .select({ count, paise: total(projectBonusShares.amountPaise) })
      .from(projectBonusShares)
      .innerJoin(projectBonuses, eq(projectBonuses.id, projectBonusShares.bonusId))
      .where(
        and(
          eq(projectBonusShares.userId, userId),
          inArray(projectBonuses.status, ['pending', 'approved']),
        ),
      ),
    db
      .select({ count, paise: total(payables.amountPaise) })
      .from(payables)
      .where(and(eq(payables.partyUserId, userId), ne(payables.status, 'paid'))),
    db
      .select({ count, paise: total(commissionEntries.amountPaise) })
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.resellerUserId, userId),
          inArray(commissionEntries.status, ['pending', 'approved']),
        ),
      ),
    db
      .select({ points: total(pointsEntries.points) })
      .from(pointsEntries)
      .where(and(eq(pointsEntries.userId, userId), eq(pointsEntries.status, 'pending'))),
  ]);
  return {
    travelClaims: owed(claims),
    bonusShares: owed(bonuses),
    payables: owed(bills),
    commissions: owed(commissions),
    pendingPoints: Math.round(points?.points ?? 0),
  };
}

/** The key permissions that no other active person holds, so the sheet can warn. */
export async function soleHolders(db: DatabaseExecutor, userId: string): Promise<Capability[]> {
  const holders = await Promise.all(
    KEY_CAPABILITIES.map((capability) => holdersOf(db, capability)),
  );
  return KEY_CAPABILITIES.filter((_, index) => {
    const people = holders[index] ?? [];
    return people.includes(userId) && people.every((id) => id === userId);
  });
}
