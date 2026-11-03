import { randomUUID } from 'node:crypto';
import type { Environment } from '../../config/environment';
import type { GatewayPayment } from './gateway-payments.service';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

/** UPI takes at most ₹1,00,000 per payment, so Razorpay hides UPI on a larger link. */
export const UPI_LIMIT_PAISE = 10_000_000;

/**
 * A link above the UPI limit can be paid in parts, the first at least ₹1 lakh, so UPI
 * stays open (live QA round 2); the same link takes the rest. Smaller links: one payment.
 */
export function partialPayment(amountPaise: number) {
  if (amountPaise <= UPI_LIMIT_PAISE) return { accept_partial: false } as const;
  return {
    accept_partial: true,
    first_min_partial_amount: Math.min(UPI_LIMIT_PAISE, amountPaise),
  } as const;
}

export interface LinkRequest {
  readonly amountPaise: number;
  readonly referenceId: string;
  readonly description: string;
  readonly customer: {
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly expiresAt: Date;
  readonly notes: Readonly<Record<string, string>>;
}

/** What Razorpay says about one link now: its status and the payments captured on it. */
export interface LinkCheck {
  readonly status: string;
  readonly payments: readonly GatewayPayment[];
}

export interface PaymentGateway {
  readonly mode: 'off' | 'sandbox' | 'live';
  readonly provider: 'razorpay' | 'sandbox';
  create(request: LinkRequest): Promise<{ providerLinkId: string; url: string }>;
  cancel(providerLinkId: string): Promise<void>;
  /** Asks Razorpay directly, for when a webhook never arrived; null when not live. */
  check(providerLinkId: string): Promise<LinkCheck | null>;
}

/** Razorpay Payment Links over HTTPS with the key pair (PRD 3.11). */
function razorpay(env: Environment): PaymentGateway {
  const auth = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
  const call = async (path: string, body?: unknown) => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: 'POST',
      headers: { authorization: auth, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      short_url?: string;
      error?: { description?: string };
    };
    if (!response.ok)
      throw new Error(
        `Razorpay ${response.status}: ${json.error?.description ?? 'request failed'}`,
      );
    return json;
  };
  const get = async (path: string): Promise<unknown> => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      headers: { authorization: auth },
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json().catch(() => ({}))) as { error?: { description?: string } };
    if (!response.ok)
      throw new Error(
        `Razorpay ${response.status}: ${json.error?.description ?? 'request failed'}`,
      );
    return json;
  };
  return {
    mode: 'live',
    provider: 'razorpay',
    async create(request) {
      const link = await call('/payment_links', {
        amount: request.amountPaise,
        currency: 'INR',
        ...partialPayment(request.amountPaise),
        reference_id: request.referenceId,
        description: request.description,
        customer: {
          name: request.customer.name,
          contact: request.customer.phone,
          ...(request.customer.email ? { email: request.customer.email } : {}),
        },
        // OneOhm sends the link itself on WhatsApp and in the app.
        notify: { sms: false, email: false },
        reminder_enable: false,
        expire_by: Math.floor(request.expiresAt.getTime() / 1000),
        notes: request.notes,
      });
      if (!link.id || !link.short_url) throw new Error('Razorpay returned no link.');
      return { providerLinkId: link.id, url: link.short_url };
    },
    async cancel(providerLinkId) {
      await call(`/payment_links/${providerLinkId}/cancel`);
    },
    async check(providerLinkId) {
      const link = (await get(`/payment_links/${providerLinkId}`)) as {
        status?: string;
        payments?: { payment_id?: string; status?: string }[] | null;
      };
      const payments: GatewayPayment[] = [];
      for (const listed of link.payments ?? []) {
        if (listed.status !== 'captured' || !listed.payment_id) continue;
        const payment = (await get(`/payments/${listed.payment_id}`)) as {
          amount?: number;
          fee?: number;
          created_at?: number;
        };
        if (!payment.amount) continue;
        payments.push({
          providerLinkId,
          gatewayPaymentId: listed.payment_id,
          amountPaise: payment.amount,
          feePaise: payment.fee ?? 0,
          paidAt: new Date((payment.created_at ?? Date.now() / 1000) * 1000),
        });
      }
      return { status: link.status ?? 'created', payments };
    },
  };
}

/** A local stand-in: the link opens a test page on this API that records a test payment. */
function sandbox(env: Environment): PaymentGateway {
  return {
    mode: 'sandbox',
    provider: 'sandbox',
    async create() {
      const providerLinkId = `sandbox_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
      return { providerLinkId, url: `${env.API_PUBLIC_URL}/v1/pay/sandbox/${providerLinkId}` };
    },
    async cancel() {},
    async check() {
      return null;
    },
  };
}

function off(): PaymentGateway {
  return {
    mode: 'off',
    provider: 'razorpay',
    async create() {
      throw new Error('Online payments are off.');
    },
    async cancel() {},
    async check() {
      return null;
    },
  };
}

export function createGateway(env: Environment): PaymentGateway {
  if (env.RAZORPAY_MODE === 'live') return razorpay(env);
  if (env.RAZORPAY_MODE === 'sandbox') return sandbox(env);
  return off();
}
