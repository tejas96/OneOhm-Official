import { randomUUID } from 'node:crypto';
import type { Environment } from '../../config/environment';

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

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

export interface PaymentGateway {
  readonly mode: 'off' | 'sandbox' | 'live';
  readonly provider: 'razorpay' | 'sandbox';
  create(request: LinkRequest): Promise<{ providerLinkId: string; url: string }>;
  cancel(providerLinkId: string): Promise<void>;
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
  return {
    mode: 'live',
    provider: 'razorpay',
    async create(request) {
      const link = await call('/payment_links', {
        amount: request.amountPaise,
        currency: 'INR',
        accept_partial: false,
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
  };
}

export function createGateway(env: Environment): PaymentGateway {
  if (env.RAZORPAY_MODE === 'live') return razorpay(env);
  if (env.RAZORPAY_MODE === 'sandbox') return sandbox(env);
  return off();
}
