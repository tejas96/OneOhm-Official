import { gatewayFeePosting, settlementPosting } from '@oneohm/domain';
import { eq } from 'drizzle-orm';
import type { DatabaseExecutor } from '../client';
import { gatewaySettlements, payments, projects } from '../schema';
import { postJournal } from './post-journal';

/** The fee the gateway kept on one online payment, booked once. */
export async function postGatewayFee(
  db: DatabaseExecutor,
  paymentId: string,
  userId: string | null,
): Promise<void> {
  const [row] = await db
    .select({ payment: payments, code: projects.code })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .where(eq(payments.id, paymentId))
    .limit(1);
  const fee = row?.payment.gatewayFeePaise ?? 0;
  if (!row || fee <= 0) return;
  await postJournal(db, {
    projectId: row.payment.projectId,
    postedByUserId: userId,
    entryDate: row.payment.receivedOn,
    memo: `${row.code} · gateway fee on ${row.payment.gatewayPaymentId ?? 'online payment'}`,
    sourceType: 'gateway_fee',
    sourceId: paymentId,
    lines: gatewayFeePosting({ feePaise: fee }),
  });
}

/** A gateway payout into the bank, booked once. */
export async function postSettlement(db: DatabaseExecutor, settlementId: string): Promise<void> {
  const [row] = await db
    .select()
    .from(gatewaySettlements)
    .where(eq(gatewaySettlements.id, settlementId))
    .limit(1);
  if (!row || row.amountPaise <= 0) return;
  await postJournal(db, {
    projectId: null,
    postedByUserId: null,
    entryDate: row.settledOn,
    memo: `Gateway payout ${row.providerSettlementId}${row.utr ? ` · UTR ${row.utr}` : ''}`,
    sourceType: 'settlement',
    sourceId: settlementId,
    lines: settlementPosting({ amountPaise: row.amountPaise }),
  });
}
