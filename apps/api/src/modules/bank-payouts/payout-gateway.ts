import { randomUUID } from 'node:crypto';
import type { PayoutStatus, TransferMode } from '@oneohm/domain';
import type { Environment } from '../../config/environment';

export const PAYOUT_GATEWAY = Symbol('PAYOUT_GATEWAY');

export interface BankDetails {
  readonly name: string;
  readonly ifsc: string;
  readonly accountNumber: string;
}

export interface NewPayout {
  readonly fundAccountId: string;
  readonly amountPaise: number;
  readonly mode: TransferMode;
  /** Our payout id: Razorpay's reference and idempotency key, so a retry never pays twice. */
  readonly referenceId: string;
  readonly narration: string;
}

/** RazorpayX, or a local stand-in that behaves like it (PRD 3.11). */
export interface PayoutGateway {
  readonly mode: 'off' | 'sandbox' | 'live';
  readonly provider: 'razorpayx' | 'sandbox';
  createContact(payee: {
    name: string;
    referenceId: string;
    phone?: string | null;
  }): Promise<string>;
  createFundAccount(contactId: string, bank: BankDetails): Promise<string>;
  createPayout(payout: NewPayout): Promise<{ id: string; status: PayoutStatus }>;
  /** The payout as RazorpayX sees it now, for when a webhook never arrived; null if not live. */
  fetchPayout(providerPayoutId: string): Promise<Record<string, unknown> | null>;
}

/** RazorpayX keeps the narration to 30 letters, digits and spaces. */
export const narrationOf = (text: string): string =>
  text
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);

function razorpayx(env: Environment): PayoutGateway {
  const auth = `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64')}`;
  const post = async (path: string, body: unknown, idempotencyKey?: string) => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: 'POST',
      headers: {
        authorization: auth,
        'content-type': 'application/json',
        ...(idempotencyKey ? { 'x-payout-idempotency': idempotencyKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      error?: { description?: string };
    };
    if (!response.ok || !json.id)
      throw new Error(
        `RazorpayX ${response.status}: ${json.error?.description ?? 'request failed'}`,
      );
    return json as { id: string; status?: string };
  };
  return {
    mode: 'live',
    provider: 'razorpayx',
    async createContact(payee) {
      const contact = await post('/contacts', {
        name: payee.name.slice(0, 50),
        type: 'vendor',
        reference_id: payee.referenceId.slice(0, 40),
        ...(payee.phone ? { contact: payee.phone.replace(/^\+91/, '') } : {}),
      });
      return contact.id;
    },
    async createFundAccount(contactId, bank) {
      const account = await post('/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: { name: bank.name, ifsc: bank.ifsc, account_number: bank.accountNumber },
      });
      return account.id;
    },
    async createPayout(payout) {
      const created = await post(
        '/payouts',
        {
          account_number: env.RAZORPAYX_ACCOUNT_NUMBER,
          fund_account_id: payout.fundAccountId,
          amount: payout.amountPaise,
          currency: 'INR',
          mode: payout.mode,
          purpose: 'vendor bill',
          queue_if_low_balance: true,
          reference_id: payout.referenceId.slice(0, 40),
          narration: narrationOf(payout.narration),
        },
        payout.referenceId,
      );
      return { id: created.id, status: (created.status as PayoutStatus) ?? 'processing' };
    },
    async fetchPayout(providerPayoutId) {
      const response = await fetch(`https://api.razorpay.com/v1/payouts/${providerPayoutId}`, {
        headers: { authorization: auth },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`RazorpayX ${response.status}: could not read the payout`);
      return (await response.json()) as Record<string, unknown>;
    },
  };
}

/** Local practice: ids look like Razorpay's; a signed test webhook completes the payout. */
function sandbox(mode: 'off' | 'sandbox'): PayoutGateway {
  const id = (prefix: string) => `${prefix}_sandbox_${randomUUID().replace(/-/g, '').slice(0, 14)}`;
  return {
    mode,
    provider: 'sandbox',
    createContact: async () => id('cont'),
    createFundAccount: async () => id('fa'),
    createPayout: async () => ({ id: id('pout'), status: 'processing' }),
    fetchPayout: async () => null,
  };
}

export function createPayoutGateway(env: Environment): PayoutGateway {
  return env.RAZORPAYX_MODE === 'live' ? razorpayx(env) : sandbox(env.RAZORPAYX_MODE);
}
