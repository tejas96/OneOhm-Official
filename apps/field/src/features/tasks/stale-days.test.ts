import { describe, expect, it } from 'vitest';
import { staleLabelDays } from './stale-days';

describe('staleLabelDays', () => {
  it('counts India days since the last update', () => {
    expect(staleLabelDays('2026-10-29T10:00:00.000Z', '2026-11-02')).toBe(4);
  });

  it('counts an update just after midnight IST as that India day', () => {
    // 2026-10-30 00:10 IST is 2026-10-29 18:40 UTC.
    expect(staleLabelDays('2026-10-29T18:40:00.000Z', '2026-11-02')).toBe(3);
  });
});
