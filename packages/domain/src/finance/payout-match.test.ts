import { describe, expect, it } from 'vitest';
import { comparePayouts, type OurPayoutRow, type RemotePayoutRow } from './payout-match';

const our = (over: Partial<OurPayoutRow> = {}): OurPayoutRow => ({
  id: 'p1',
  payableId: 'b1',
  providerPayoutId: 'pout_1',
  status: 'processed',
  amountPaise: 100_00,
  feePaise: 5_90,
  ...over,
});
const far = (over: Partial<RemotePayoutRow> = {}): RemotePayoutRow => ({
  id: 'pout_1',
  referenceId: 'p1',
  status: 'processed',
  amountPaise: 100_00,
  feePaise: 5_90,
  ...over,
});

describe('comparePayouts', () => {
  it('counts equal rows as matched', () => {
    const result = comparePayouts([our()], [far()]);
    expect(result).toMatchObject({ matched: 1, lines: [] });
  });
  it('matches by our reference id when we never saved the RazorpayX id', () => {
    expect(comparePayouts([our({ providerPayoutId: null })], [far()]).matched).toBe(1);
  });
  it('does not flag the fee of a failed payout, which RazorpayX gives back', () => {
    // Seen with real RazorpayX test mode on 5 Nov 2026: a failed ₹100 still listed ₹2.36.
    const failed = comparePayouts(
      [our({ status: 'failed', feePaise: 0 })],
      [far({ status: 'failed', feePaise: 2_36 })],
    );
    expect(failed).toMatchObject({ matched: 1, lines: [] });
  });
  it('lists rows on one side only', () => {
    const result = comparePayouts([our({ id: 'p9', providerPayoutId: 'x' })], [far()]);
    expect(result.counts).toMatchObject({ only_oneohm: 1, only_razorpayx: 1 });
    expect(result.lines.find((l) => l.kind === 'only_razorpayx')?.payableId).toBeNull();
  });
  it('ignores a transfer that failed before reaching RazorpayX', () => {
    const result = comparePayouts([our({ providerPayoutId: null, status: 'failed' })], []);
    expect(result.lines).toEqual([]);
  });
  it('reports status, amount and fee differences with plain text', () => {
    const result = comparePayouts(
      [our()],
      [far({ status: 'processing', amountPaise: 200_00, feePaise: 0 })],
    );
    expect(result.matched).toBe(0);
    expect(result.counts).toMatchObject({ status: 1, amount: 1, fee: 1 });
    expect(result.lines.map((l) => l.text).join(' ')).toMatch(/OneOhm says processed/);
  });
});
