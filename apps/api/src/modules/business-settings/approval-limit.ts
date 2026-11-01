import { type DatabaseExecutor, payables, readBusinessSetting } from '@oneohm/database';
import { type Capability, mayApproveAmount } from '@oneohm/domain';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../common/auth/actor';
import { forbidden } from '../../common/http/errors';

const RULES = {
  bill: {
    limit: 'billLimitPaise',
    everyday: 'finance.record_payments',
    words: 'Bills',
  },
  bonus: { limit: 'bonusLimitPaise', everyday: 'people.manage', words: 'Bonuses' },
} as const satisfies Record<
  string,
  { limit: 'billLimitPaise' | 'bonusLimitPaise'; everyday: Capability; words: string }
>;

/**
 * Where money moves, the limit in Settings → Approvals decides who may say yes (PRD 7.2,
 * 7.3): within it the everyday right is enough; above it only someone who approves
 * payments may.
 */
export async function assertWithinApprovalLimit(
  db: DatabaseExecutor,
  actor: Actor,
  kind: keyof typeof RULES,
  amountPaise: number,
): Promise<void> {
  const rule = RULES[kind];
  const policy = await readBusinessSetting(db, 'approvals');
  const limit = policy[rule.limit];
  const rights = [...actor.capabilities];
  if (mayApproveAmount(rights, amountPaise, limit, 'finance.approve_payments', rule.everyday))
    return;
  throw forbidden(
    limit > 0
      ? `${rule.words} above ${formatInr(limit)} need someone who approves payments.`
      : `${rule.words} need someone who approves payments.`,
  );
}

/** A bill's own amount against the limit (finance approves bills one by one). */
export async function assertBillWithinLimit(
  db: DatabaseExecutor,
  actor: Actor,
  payableId: string,
): Promise<void> {
  const [bill] = await db
    .select({ amount: payables.amountPaise })
    .from(payables)
    .where(eq(payables.id, payableId));
  if (bill) await assertWithinApprovalLimit(db, actor, 'bill', bill.amount);
}
