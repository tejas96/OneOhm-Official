import { describe, expect, it } from 'vitest';
import { oldestClaimDay, sweepTellsProof } from './duty-alert-sweep';

const now = new Date('2026-11-16T10:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('sweepTellsProof', () => {
  it('tells only about a visit closed in the last 15 minutes (no burst on the first run)', () => {
    expect(sweepTellsProof(ago(5), now)).toBe(true);
    expect(sweepTellsProof(ago(15), now)).toBe(true);
    expect(sweepTellsProof(ago(16), now)).toBe(false);
    expect(sweepTellsProof(ago(300), now)).toBe(false);
    expect(sweepTellsProof(null, now)).toBe(false);
  });
});

describe('oldestClaimDay', () => {
  it('is the retention cut-off: older claims raise nothing, so a purge never re-raises', () => {
    expect(oldestClaimDay('2026-11-16', 90)).toBe('2026-08-18');
    expect(oldestClaimDay('2026-11-16', 30)).toBe('2026-10-17');
  });
});
