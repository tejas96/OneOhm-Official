import {
  customerCredits,
  type Database,
  postCustomerCredit,
  projectActivities,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';

export interface GatewayExcess {
  readonly projectId: string;
  readonly milestoneId: string;
  readonly amountPaise: number;
  readonly receivedOn: string;
  readonly gatewayPaymentId: string;
  /** Only when no payment row carried the fee (nothing at all was owed). */
  readonly feePaise: number | null;
}

/**
 * An online payment above what was owed: the extra is held for the customer as credit
 * (2110), with its ledger entry, exactly once per gateway payment. Finance then refunds
 * it or applies it to the next milestone.
 */
export async function recordGatewayExcess(db: Database, excess: GatewayExcess): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [credit] = await tx
      .insert(customerCredits)
      .values({
        projectId: excess.projectId,
        milestoneId: excess.milestoneId,
        amountPaise: excess.amountPaise,
        method: 'razorpay',
        receivedOn: excess.receivedOn,
        reference: excess.gatewayPaymentId,
        gatewayPaymentId: excess.gatewayPaymentId,
        gatewayFeePaise: excess.feePaise,
      })
      .onConflictDoNothing()
      .returning({ id: customerCredits.id });
    if (!credit) return false;
    await tx.insert(projectActivities).values({
      projectId: excess.projectId,
      kind: 'payment',
      message: `${formatInr(excess.amountPaise)} paid online above what was owed, held as credit.`,
    });
    await postCustomerCredit(tx, credit.id, null);
    return true;
  });
}
