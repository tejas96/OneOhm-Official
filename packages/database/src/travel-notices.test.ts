import { beforeEach, describe, expect, it, vi } from 'vitest';

const sent = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('./notify', () => sent);

import { tellTravelPaid } from './travel-notices';

const dbWith = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'from']) chain[name] = () => chain;
  chain.where = () => ({ limit: async () => rows });
  return chain as never;
};

beforeEach(() => vi.clearAllMocks());

describe('telling the worker their travel was paid (S8)', () => {
  it('says what was paid and for which day, and opens their claim', async () => {
    const told = await tellTravelPaid(
      dbWith([
        { id: 'c1', userId: 'worker', workDate: '2026-11-09', amountPaise: 42000, projectId: null },
      ]),
      'bill-1',
    );
    expect(told).toBe(true);
    const [, to, notice] = sent.notify.mock.calls[0] as [unknown, unknown, Record<string, unknown>];
    expect(to).toEqual({ userId: 'worker' });
    expect(notice).toMatchObject({
      kind: 'travel_claim_paid',
      subject: { type: 'travel_claim', id: 'c1' },
      dedupeKey: 'travel_claim_paid:c1',
    });
    expect(notice.title).toMatch(/₹420(\.00)? travel for 9 Nov 2026 paid/);
  });

  it('says nothing for a bill that is not from a travel claim', async () => {
    expect(await tellTravelPaid(dbWith([]), 'vendor-bill')).toBe(false);
    expect(sent.notify).not.toHaveBeenCalled();
  });
});
