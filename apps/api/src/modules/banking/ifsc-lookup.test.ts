import { describe, expect, it, vi } from 'vitest';
import { createIfscLookup, IFSC_CACHE_MS } from './ifsc-lookup';

const found = {
  BANK: 'State Bank of India',
  IFSC: 'SBIN0001234',
  BRANCH: 'ANDHERI EAST',
  CITY: 'MUMBAI',
  STATE: 'MAHARASHTRA',
};
const reply = (status: number, body: unknown = {}) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('IFSC lookup', () => {
  it('finds the branch and keeps it for 24 hours', async () => {
    const fetchImpl = reply(200, found);
    let clock = 0;
    const lookup = createIfscLookup(fetchImpl, () => clock);
    const first = await lookup('SBIN0001234');
    expect(first).toEqual({
      available: true,
      branch: {
        ifsc: 'SBIN0001234',
        bank: 'State Bank of India',
        branch: 'ANDHERI EAST',
        city: 'MUMBAI',
        state: 'MAHARASHTRA',
      },
    });
    clock = IFSC_CACHE_MS - 1;
    await lookup('SBIN0001234');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock = IFSC_CACHE_MS + 1;
    await lookup('SBIN0001234');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('says no branch has a code the list does not know, and remembers it', async () => {
    const fetchImpl = reply(404, 'Not Found');
    const lookup = createIfscLookup(fetchImpl);
    expect(await lookup('ABCD0000000')).toEqual({ available: true, branch: null });
    await lookup('ABCD0000000');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('says the service is down on an error or timeout, and asks again next time', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(new Response('oops', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(found), { status: 200 }));
    const lookup = createIfscLookup(fetchImpl);
    expect(await lookup('SBIN0001234')).toEqual({ available: false, branch: null });
    expect(await lookup('SBIN0001234')).toEqual({ available: false, branch: null });
    expect((await lookup('SBIN0001234')).available).toBe(true);
  });
});
