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
  | { readonly kind: 'ignored' };

interface Entity {
  id?: string;
  amount?: number;
  fee?: number;
  tax?: number;
  fees?: number;
  utr?: string | null;
  created_at?: number;
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
    default:
      return { kind: 'ignored' };
  }
}
