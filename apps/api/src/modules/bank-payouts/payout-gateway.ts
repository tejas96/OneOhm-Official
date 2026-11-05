import { randomUUID } from 'node:crypto';
import type { PayoutStatus, RemotePayoutRow, TransferMode } from '@oneohm/domain';
import type { Environment } from '../../config/environment';
import {
  ipNotAllowedRejection,
  isIpNotAllowed,
  PayoutRejected,
  PayoutUnsure,
} from './payout-errors';

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
  /** Finds a payout by our reference id, when we never got its RazorpayX id; null if none. */
  findPayoutByReference(referenceId: string): Promise<Record<string, unknown> | null>;
  /** RazorpayX's payouts made in the range, all pages; null in practice mode (no remote side). */
  listPayouts(range: { from: Date; to: Date }): Promise<RemotePayoutRow[] | null>;
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
    let response: Response;
    try {
      response = await fetch(`https://api.razorpay.com/v1${path}`, {
        method: 'POST',
        headers: {
          authorization: auth,
          'content-type': 'application/json',
          ...(idempotencyKey ? { 'x-payout-idempotency': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      // Timeout or network: the request may or may not have arrived.
      throw new PayoutUnsure(error instanceof Error ? error.message : 'could not reach RazorpayX');
    }
    const json = (await response.json().catch(() => ({}))) as {
      id?: string;
      status?: string;
      error?: { code?: string; description?: string };
    };
    const description = json.error?.description;
    // Blocked server: a clear "no" even when RazorpayX gives no words.
    if (isIpNotAllowed(response.status, json.error?.code ?? '', description ?? ''))
      throw ipNotAllowedRejection(response.status, description ?? '');
    // A 4xx with an error body is a clear "no". Anything else leaves us unsure.
    if (response.status >= 400 && response.status < 500 && response.status !== 408 && description)
      throw new PayoutRejected(
        json.error?.code ?? 'BAD_REQUEST_ERROR',
        response.status,
        description,
      );
    if (!response.ok || !json.id)
      throw new PayoutUnsure(`RazorpayX ${response.status}: ${description ?? 'request failed'}`);
    return json as { id: string; status?: string };
  };
  const get = async (path: string): Promise<Record<string, unknown>> => {
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      headers: { authorization: auth },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { code?: string; description?: string };
      };
      const description = body.error?.description ?? '';
      if (isIpNotAllowed(response.status, body.error?.code ?? '', description))
        throw ipNotAllowedRejection(response.status, description);
      throw new Error(`RazorpayX ${response.status}: could not read the payout`);
    }
    return (await response.json()) as Record<string, unknown>;
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
          queue_if_low_balance: false,
          reference_id: payout.referenceId.slice(0, 40),
          narration: narrationOf(payout.narration),
        },
        payout.referenceId,
      );
      return { id: created.id, status: (created.status as PayoutStatus) ?? 'processing' };
    },
    fetchPayout: (providerPayoutId) => get(`/payouts/${encodeURIComponent(providerPayoutId)}`),
    async findPayoutByReference(referenceId) {
      const query = new URLSearchParams({
        account_number: env.RAZORPAYX_ACCOUNT_NUMBER ?? '',
        reference_id: referenceId.slice(0, 40),
      });
      const found = (await get(`/payouts?${query}`)) as { items?: Record<string, unknown>[] };
      return found.items?.[0] ?? null;
    },
    async listPayouts({ from, to }) {
      const rows: RemotePayoutRow[] = [];
      // 100 a page; the cap keeps a runaway answer from looping for ever.
      for (let skip = 0; skip < 5000; skip += 100) {
        const query = new URLSearchParams({
          account_number: env.RAZORPAYX_ACCOUNT_NUMBER ?? '',
          from: String(Math.floor(from.getTime() / 1000)),
          to: String(Math.floor(to.getTime() / 1000)),
          count: '100',
          skip: String(skip),
        });
        const page = (await get(`/payouts?${query}`)) as { items?: Record<string, unknown>[] };
        const items = page.items ?? [];
        for (const item of items)
          rows.push({
            id: String(item.id),
            referenceId: typeof item.reference_id === 'string' ? item.reference_id : null,
            status: String(item.status),
            amountPaise: Number(item.amount ?? 0),
            feePaise: Number(item.fees ?? 0),
          });
        if (items.length < 100) break;
      }
      return rows;
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
    findPayoutByReference: async () => null,
    listPayouts: async () => null,
  };
}

export function createPayoutGateway(env: Environment): PayoutGateway {
  return env.RAZORPAYX_MODE === 'live' ? razorpayx(env) : sandbox(env.RAZORPAYX_MODE);
}
