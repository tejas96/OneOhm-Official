import {
  customerCredits,
  type Database,
  notifyHolders,
  payments,
  projects,
} from '@oneohm/database';
import { formatInr } from '@oneohm/shared';
import { eq } from 'drizzle-orm';
import { recordAudit } from '../../common/audit';
import type { GatewayRefund } from './razorpay-events';

/**
 * A refund or a dispute on an online payment (A13). Nothing is reversed on its own: the
 * event is written to the audit log and finance is told once, naming the receipt, to
 * check it in Razorpay and correct the records by hand.
 */
export async function flagRefund(db: Database, refund: GatewayRefund): Promise<string> {
  const found = await paymentOf(db, refund.gatewayPaymentId);
  if (!found) return flagUnknown(db, refund);
  const receipt = found.receiptNumber ?? `credit ${refund.gatewayPaymentId}`;
  const amount = refund.amountPaise > 0 ? ` of ${formatInr(refund.amountPaise)}` : '';
  await db.transaction(async (tx) => {
    await recordAudit(tx, null, 'payment.refund_or_dispute', 'project', found.projectId, {
      what: refund.what,
      gatewayPaymentId: refund.gatewayPaymentId,
      amountPaise: refund.amountPaise,
      receiptNumber: found.receiptNumber,
    });
    await notifyHolders(tx, 'finance.record_payments', {
      kind: 'payment_refund',
      title: `Refund/dispute on receipt ${receipt}`,
      body: `Razorpay reports a ${refund.what}${amount} on ${found.code}, receipt ${receipt} (${refund.gatewayPaymentId}) — please check. Nothing was changed in OneOhm.`,
      subject: { type: 'payment', id: found.id, projectId: found.projectId },
      dedupeKey: `payment_refund:${refund.gatewayPaymentId}:${refund.key}`,
    });
  });
  return `${refund.what} flagged`;
}

/** A refund or dispute on a payment OneOhm never recorded still reaches finance. */
async function flagUnknown(db: Database, refund: GatewayRefund): Promise<string> {
  const amount = refund.amountPaise > 0 ? ` of ${formatInr(refund.amountPaise)}` : '';
  await db.transaction(async (tx) => {
    await recordAudit(
      tx,
      null,
      'payment.refund_or_dispute',
      'gateway_payment',
      refund.gatewayPaymentId,
      {
        what: refund.what,
        amountPaise: refund.amountPaise,
        receiptNumber: null,
      },
    );
    await notifyHolders(tx, 'finance.record_payments', {
      kind: 'payment_refund',
      title: `${refund.what === 'refund' ? 'Refund' : 'Dispute'} on a payment we have no record of — please check`,
      body: `Razorpay reports a ${refund.what}${amount} on payment ${refund.gatewayPaymentId}, which has no receipt in OneOhm. Please check it in Razorpay.`,
      dedupeKey: `payment_refund:${refund.gatewayPaymentId}:${refund.key}`,
    });
  });
  return `${refund.what} flagged (no payment on record)`;
}

/** The payment (or, when nothing was owed, the held credit) the gateway payment made. */
async function paymentOf(db: Database, gatewayPaymentId: string) {
  const [payment] = await db
    .select({
      id: payments.id,
      projectId: payments.projectId,
      receiptNumber: payments.receiptNumber,
      code: projects.code,
    })
    .from(payments)
    .innerJoin(projects, eq(projects.id, payments.projectId))
    .where(eq(payments.gatewayPaymentId, gatewayPaymentId));
  if (payment) return payment;
  const [credit] = await db
    .select({ id: customerCredits.id, projectId: customerCredits.projectId, code: projects.code })
    .from(customerCredits)
    .innerJoin(projects, eq(projects.id, customerCredits.projectId))
    .where(eq(customerCredits.gatewayPaymentId, gatewayPaymentId));
  return credit ? { ...credit, receiptNumber: null } : null;
}
