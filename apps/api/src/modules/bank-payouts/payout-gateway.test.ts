import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  IP_NOT_ALLOWED_TEXT,
  isIpNotAllowed,
  isLowBalance,
  PayoutRejected,
  PayoutUnsure,
  rejectionText,
} from './payout-errors';
import { createPayoutGateway } from './payout-gateway';

const live = () =>
  createPayoutGateway({
    RAZORPAYX_MODE: 'live',
    RAZORPAY_KEY_ID: 'rzp_test_x',
    RAZORPAY_KEY_SECRET: 'secret',
    RAZORPAYX_ACCOUNT_NUMBER: '2323230000000000',
  } as never);

const payout = {
  fundAccountId: 'fa_1',
  amountPaise: 100_00,
  mode: 'IMPS' as const,
  referenceId: '8b7f2c52-0c1d-4f43-8f55-1f3c2b6f6a11',
  narration: 'OneOhm Test',
};

const reply = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

afterEach(() => vi.unstubAllGlobals());

describe('RazorpayX payout errors', () => {
  it('turns a 4xx with an error body into a clear rejection', async () => {
    vi.stubGlobal(
      'fetch',
      reply(400, { error: { code: 'BAD_REQUEST_ERROR', description: 'Bad IFSC' } }),
    );
    const error = await live()
      .createPayout(payout)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayoutRejected);
    expect(error).toMatchObject({
      httpStatus: 400,
      code: 'BAD_REQUEST_ERROR',
      description: 'Bad IFSC',
    });
  });

  it('is unsure after a server error, a timeout or a reply with no id', async () => {
    vi.stubGlobal('fetch', reply(502, { error: { description: 'Bad gateway' } }));
    await expect(live().createPayout(payout)).rejects.toBeInstanceOf(PayoutUnsure);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('timed out'))),
    );
    await expect(live().createPayout(payout)).rejects.toBeInstanceOf(PayoutUnsure);
    vi.stubGlobal('fetch', reply(200, {}));
    await expect(live().createPayout(payout)).rejects.toBeInstanceOf(PayoutUnsure);
    vi.stubGlobal('fetch', reply(400, {}));
    await expect(live().createPayout(payout)).rejects.toBeInstanceOf(PayoutUnsure);
  });

  it('never queues a payout when the balance is low', async () => {
    const fetchMock = reply(200, { id: 'pout_1', status: 'processing' });
    vi.stubGlobal('fetch', fetchMock);
    await live().createPayout(payout);
    const sent = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(sent.queue_if_low_balance).toBe(false);
    expect(sent.reference_id).toBe(payout.referenceId);
  });

  it('finds a payout by our reference, or null when there is none', async () => {
    const fetchMock = reply(200, { items: [{ id: 'pout_9', status: 'processed' }] });
    vi.stubGlobal('fetch', fetchMock);
    expect(await live().findPayoutByReference(payout.referenceId)).toMatchObject({ id: 'pout_9' });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toContain(
      `account_number=2323230000000000&reference_id=${payout.referenceId}`,
    );
    vi.stubGlobal('fetch', reply(200, { items: [] }));
    expect(await live().findPayoutByReference(payout.referenceId)).toBeNull();
  });

  it('gives the low-balance text for an empty RazorpayX account', () => {
    const low = new PayoutRejected(
      'BAD_REQUEST_ERROR',
      400,
      'Your account does not have enough balance to carry out the fund transfer operation.',
    );
    expect(isLowBalance(low)).toBe(true);
    expect(rejectionText(low)).toBe(
      'Not enough money in your RazorpayX balance. Add money, then pay again.',
    );
    expect(rejectionText(new PayoutRejected('X', 400, 'Bad IFSC'))).toContain('Bad IFSC');
  });
});

describe('RazorpayX blocked server (IP allow-list)', () => {
  const blocked = [
    [403, 'BAD_REQUEST_ERROR', 'Request from IP 1.2.3.4 is not allowed. Please whitelist this IP.'],
    [401, 'BAD_REQUEST_ERROR', 'Access denied: IP address not in the allowlist'],
    [403, 'BAD_REQUEST_ERROR', 'This action is not allowed'],
    [403, '', ''],
  ] as const;
  it.each(blocked)('recognises %s %s %s', (status, code, description) => {
    expect(isIpNotAllowed(status, code, description)).toBe(true);
  });
  it('does not mistake wrong keys, bad input or low balance for it', () => {
    expect(isIpNotAllowed(401, 'BAD_REQUEST_ERROR', 'Authentication failed')).toBe(false);
    expect(isIpNotAllowed(400, 'BAD_REQUEST_ERROR', 'IFSC is invalid')).toBe(false);
    expect(isIpNotAllowed(400, 'BAD_REQUEST_ERROR', 'IP is not allowed')).toBe(false);
    expect(isIpNotAllowed(403, 'BAD_REQUEST_ERROR', 'Insufficient balance')).toBe(false);
  });
  it('rejects a create call with the owner text and the typed code', async () => {
    vi.stubGlobal(
      'fetch',
      reply(403, { error: { code: 'BAD_REQUEST_ERROR', description: 'IP not whitelisted' } }),
    );
    const error = await live()
      .createContact({ name: 'A', referenceId: 'x' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PayoutRejected);
    expect(error).toMatchObject({ code: 'ip_not_allowed', httpStatus: 403 });
    expect(rejectionText(error as PayoutRejected)).toBe(IP_NOT_ALLOWED_TEXT);
    expect((error as Error).message).toBe(IP_NOT_ALLOWED_TEXT);
  });
  it('rejects a bare 403 with no body, and a fetch of a payout the same way', async () => {
    vi.stubGlobal('fetch', reply(403, {}));
    await expect(live().createPayout(payout)).rejects.toMatchObject({ code: 'ip_not_allowed' });
    await expect(live().fetchPayout('pout_1')).rejects.toMatchObject({ code: 'ip_not_allowed' });
  });
});

describe('listPayouts', () => {
  it('reads every page and maps the fields', async () => {
    const item = (n: number) => ({
      id: `pout_${n}`,
      reference_id: `r${n}`,
      status: 'processed',
      amount: 100,
      fees: 5,
    });
    const pages = [Array.from({ length: 100 }, (_, n) => item(n)), [item(100)]];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: pages.shift() })));
    vi.stubGlobal('fetch', fetchMock);
    const rows = await live().listPayouts({ from: new Date(0), to: new Date(1000) });
    expect(rows).toHaveLength(101);
    expect(rows?.[0]).toEqual({
      id: 'pout_0',
      referenceId: 'r0',
      status: 'processed',
      amountPaise: 100,
      feePaise: 5,
    });
    expect(String((fetchMock.mock.calls as unknown as [string][])[1]?.[0])).toContain('skip=100');
  });
  it('is null in practice mode', async () => {
    const gateway = createPayoutGateway({ RAZORPAYX_MODE: 'sandbox' } as never);
    expect(await gateway.listPayouts({ from: new Date(), to: new Date() })).toBeNull();
  });
});
