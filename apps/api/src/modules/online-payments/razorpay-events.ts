import { createHmac, timingSafeEqual } from 'node:crypto';
import type { GatewayPayment, GatewayPayout } from './gateway-payments.service';

/** Razorpay signs the raw body with the webhook secret (HMAC SHA-256, hex). */
export function verifySignature(
  rawBody: Buffer,
  signature: string | undefined,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = Buffer.from(createHmac('sha256', secret).update(rawBody).digest('hex'));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export type GatewayNews =
  | { readonly kind: 'paid'; readonly payment: GatewayPayment }
  | {
      readonly kind: 'closed';
      readonly providerLinkId: string;
      readonly status: 'expired' | 'cancelled';
    }
  | { readonly kind: 'payout'; readonly payout: GatewayPayout }
  | { readonly kind: 'refund'; readonly refund: GatewayRefund }
  | { readonly kind: 'ignored' };

/** Money going back to the customer (a refund) or held by their bank (a dispute). */
export interface GatewayRefund {
  /** 'refund', or 'dispute (created)', 'dispute (lost)' and so on. */
  readonly what: string;
  readonly gatewayPaymentId: string;
  readonly amountPaise: number;
  /** One alert per refunded payment, and one per dispute and step. */
  readonly key: string;
}

interface Entity {
  id?: string;
  amount?: number;
  fee?: number;
  tax?: number;
  fees?: number;
  utr?: string | null;
  created_at?: number;
  payment_id?: string;
  amount_refunded?: number;
}

interface RazorpayEvent {
  event?: string;
  created_at?: number;
  payload?: Record<string, { entity?: Entity } | undefined>;
}

const at = (seconds: number | undefined) => new Date((seconds ?? Date.now() / 1000) * 1000);

/** What a Razorpay webhook means for OneOhm; events we do not use are ignored. */
export function readEvent(body: unknown): GatewayNews {
  const event = body as RazorpayEvent;
  const link = event.payload?.payment_link?.entity;
  const payment = event.payload?.payment?.entity;
  switch (event.event) {
    case 'payment_link.paid':
    case 'payment_link.partially_paid':
      if (!link?.id || !payment?.id || !payment.amount) return { kind: 'ignored' };
      return {
        kind: 'paid',
        payment: {
          providerLinkId: link.id,
          gatewayPaymentId: payment.id,
          amountPaise: payment.amount,
          feePaise: payment.fee ?? 0,
          paidAt: at(payment.created_at),
        },
      };
    case 'payment_link.expired':
    case 'payment_link.cancelled':
      if (!link?.id) return { kind: 'ignored' };
      return {
        kind: 'closed',
        providerLinkId: link.id,
        status: event.event === 'payment_link.expired' ? 'expired' : 'cancelled',
      };
    case 'settlement.processed': {
      const settlement = event.payload?.settlement?.entity;
      if (!settlement?.id || settlement.amount === undefined) return { kind: 'ignored' };
      return {
        kind: 'payout',
        payout: {
          provider: 'razorpay',
          providerSettlementId: settlement.id,
          amountPaise: settlement.amount,
          feesPaise: settlement.fees ?? 0,
          taxPaise: settlement.tax ?? 0,
          utr: settlement.utr ?? null,
          settledAt: at(settlement.created_at),
        },
      };
    }
    case 'refund.processed':
    case 'payment.refunded':
      return readRefund(event);
    default:
      return event.event?.startsWith('payment.dispute.') ? readDispute(event) : { kind: 'ignored' };
  }
}

function readRefund(event: RazorpayEvent): GatewayNews {
  const refund = event.payload?.refund?.entity;
  const payment = event.payload?.payment?.entity;
  const paymentId = refund?.payment_id ?? payment?.id;
  if (!paymentId) return { kind: 'ignored' };
  const amountPaise = refund?.amount ?? payment?.amount_refunded ?? 0;
  return {
    kind: 'refund',
    refund: { what: 'refund', gatewayPaymentId: paymentId, amountPaise, key: 'refund' },
  };
}

function readDispute(event: RazorpayEvent): GatewayNews {
  const dispute = event.payload?.dispute?.entity;
  if (!dispute?.id || !dispute.payment_id) return { kind: 'ignored' };
  const step = event.event?.slice('payment.dispute.'.length) ?? '';
  return {
    kind: 'refund',
    refund: {
      what: `dispute (${step.replace('_', ' ')})`,
      gatewayPaymentId: dispute.payment_id,
      amountPaise: dispute.amount ?? 0,
      key: `${dispute.id}:${event.event}`,
    },
  };
}
