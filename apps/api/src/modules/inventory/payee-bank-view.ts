import type { PayeeBankHold } from '@oneohm/api-contracts';
import {
  bankPayouts,
  type DatabaseExecutor,
  goodsReceipts,
  purchaseOrders,
  users,
  workOrderAdvances,
  workOrders,
} from '@oneohm/database';
import { isHeld, releaseProblem } from '@oneohm/domain';
import { and, eq, inArray, or } from 'drizzle-orm';
import { type Actor, can } from '../../common/auth/actor';

/** The columns of a vendor or contractor row that the bank hold needs. */
export interface PayeeBankRow {
  readonly id: string;
  readonly bankAccountName: string | null;
  readonly bankAccountNumber: string | null;
  readonly bankIfsc: string | null;
  readonly bankChangedAt: Date | null;
  readonly bankChangedByUserId: string | null;
  readonly bankHoldUntil: Date | null;
  readonly bankHoldReleasedAt: Date | null;
}

export interface PayeeBankView {
  readonly bankHold: PayeeBankHold | null;
  readonly bankIsNew: boolean;
}

/** How long a first-entered account counts as new. */
export const NEW_ACCOUNT_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * What the screen shows about a payee's bank details: the running hold (null when none) and
 * whether the account is new. "New" means: complete details first entered (not changed, so no
 * hold) in the last 7 days, and no bank payout of ours has been processed to this payee yet.
 */
export async function payeeBankViews(
  db: DatabaseExecutor,
  actor: Actor,
  kind: 'vendor' | 'contractor',
  rows: readonly PayeeBankRow[],
  now = new Date(),
): Promise<Map<string, PayeeBankView>> {
  const names = await changerNames(db, rows);
  const candidates = rows.filter(
    (row) =>
      row.bankChangedAt !== null &&
      row.bankHoldUntil === null &&
      Boolean(row.bankAccountNumber && row.bankAccountName && row.bankIfsc) &&
      now.getTime() - row.bankChangedAt.getTime() < NEW_ACCOUNT_DAYS * DAY_MS,
  );
  const paid = await paidBefore(
    db,
    kind,
    candidates.map((row) => row.id),
  );
  return new Map(
    rows.map((row): [string, PayeeBankView] => {
      const held = isHeld(
        { heldUntil: row.bankHoldUntil, releasedAt: row.bankHoldReleasedAt },
        now,
      );
      const bankHold: PayeeBankHold | null =
        held && row.bankHoldUntil
          ? {
              changedAt: row.bankChangedAt?.toISOString() ?? null,
              changedByName: row.bankChangedByUserId
                ? (names.get(row.bankChangedByUserId) ?? null)
                : null,
              until: row.bankHoldUntil.toISOString(),
              canRelease:
                releaseProblem({
                  held,
                  canApprovePayments: can(actor, 'finance.approve_payments'),
                  userId: actor.userId,
                  changedByUserId: row.bankChangedByUserId,
                }) === null,
            }
          : null;
      const bankIsNew = candidates.includes(row) && !paid.has(row.id);
      return [row.id, { bankHold, bankIsNew }];
    }),
  );
}

async function changerNames(
  db: DatabaseExecutor,
  rows: readonly PayeeBankRow[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.flatMap((row) => (row.bankChangedByUserId ? [row.bankChangedByUserId] : []))),
  ];
  if (ids.length === 0) return new Map();
  const found = await db
    .select({ id: users.id, name: users.fullName })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(found.map((user) => [user.id, user.name]));
}

/** Payees (of these ids) that already have a processed bank payout. */
async function paidBefore(
  db: DatabaseExecutor,
  kind: 'vendor' | 'contractor',
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const processed = eq(bankPayouts.status, 'processed');
  if (kind === 'vendor') {
    const found = await db
      .selectDistinct({ id: purchaseOrders.vendorId })
      .from(bankPayouts)
      .innerJoin(goodsReceipts, eq(goodsReceipts.payableId, bankPayouts.payableId))
      .innerJoin(purchaseOrders, eq(purchaseOrders.id, goodsReceipts.purchaseOrderId))
      .where(and(processed, inArray(purchaseOrders.vendorId, [...ids])));
    return new Set(found.map((row) => row.id));
  }
  const viaOrder = await db
    .selectDistinct({ id: workOrders.contractorId })
    .from(bankPayouts)
    .innerJoin(
      workOrders,
      or(
        eq(workOrders.payableId, bankPayouts.payableId),
        eq(workOrders.retentionPayableId, bankPayouts.payableId),
      ),
    )
    .where(and(processed, inArray(workOrders.contractorId, [...ids])));
  const viaAdvance = await db
    .selectDistinct({ id: workOrders.contractorId })
    .from(bankPayouts)
    .innerJoin(workOrderAdvances, eq(workOrderAdvances.payableId, bankPayouts.payableId))
    .innerJoin(workOrders, eq(workOrders.id, workOrderAdvances.workOrderId))
    .where(and(processed, inArray(workOrders.contractorId, [...ids])));
  return new Set([...viaOrder, ...viaAdvance].map((row) => row.id));
}
