import { formatInr, todayIn } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import type { Transaction } from './client';
import { postPayableApproved } from './ledger/payable-postings';
import { notify, notifyHolders } from './notify';
import { daySpan } from './readable-day';
import { payables } from './schema/finance.schema';
import { users } from './schema/identity.schema';
import { auditLog } from './schema/records.schema';
import { travelClaims } from './schema/site-activity.schema';
import { TRAVEL_NOTICES } from './travel-notices';

const km = (metres: number) => `${(metres / 1000).toFixed(1)} km`;

export type TravelClaimRow = typeof travelClaims.$inferSelect;

/** Who approves: a person, or the system (null) on a clean automatic claim. */
export interface ClaimApprover {
  readonly userId: string | null;
  readonly note?: string | null | undefined;
}

/**
 * Approves a pending claim, in the caller's transaction (the claim row is locked or was just
 * made there). One path for a manager's tap and for the system: the money owed to the employee
 * is made and booked in the ledger, the claim becomes approved, the worker and finance are told
 * and it is audited. Returns the payable's id.
 */
export async function approveTravelClaim(
  tx: Transaction,
  row: TravelClaimRow,
  approver: ClaimApprover,
): Promise<string> {
  const [person] = await tx
    .select({ fullName: users.fullName })
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  const name = person?.fullName ?? 'Employee';
  const now = new Date();
  const [payable] = await tx
    .insert(payables)
    .values({
      party: 'employee',
      partyName: name,
      partyUserId: row.userId,
      description: `Travel ${daySpan(row.workDate, row.workDate)} · ${km(row.distanceM)} at ${formatInr(row.ratePaisePerKm)}/km`,
      amountPaise: row.amountPaise,
      dueOn: todayIn(),
      status: 'approved',
      approvedByUserId: approver.userId,
      approvedAt: now,
    })
    .returning({ id: payables.id });
  if (!payable) throw new Error('Payable insert returned nothing.');
  await postPayableApproved(tx, payable.id, approver.userId);
  await tx
    .update(travelClaims)
    .set({
      status: 'approved',
      decidedByUserId: approver.userId,
      decidedAt: now,
      decisionNote: approver.note?.trim() || null,
      payableId: payable.id,
      autoApproved: approver.userId === null,
      updatedAt: now,
    })
    .where(eq(travelClaims.id, row.id));
  await notify(
    tx,
    { userId: row.userId },
    TRAVEL_NOTICES.decided(row.id, true, row.workDate, row.amountPaise),
  );
  // Finance pays what is owed: told now, with an alert that opens the bill.
  await notifyHolders(
    tx,
    'finance.record_payments',
    TRAVEL_NOTICES.readyToPay(payable.id, row.projectId, name, row.workDate, row.amountPaise),
    approver.userId,
  );
  await tx.insert(auditLog).values({
    actorUserId: approver.userId,
    action: 'travel_claim.approved',
    entity: 'travel_claim',
    entityId: row.id,
    data: { amountPaise: row.amountPaise, payableId: payable.id, auto: approver.userId === null },
  });
  return payable.id;
}
