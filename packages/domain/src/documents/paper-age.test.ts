import { describe, expect, it } from 'vitest';
import { isCurrentPaper, isTooOld } from './paper-age';

const now = new Date('2026-11-05T10:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe('how old a paper may be', () => {
  it('has no limit when none is set', () => {
    expect(isCurrentPaper(daysAgo(900), null, now)).toBe(true);
    expect(isCurrentPaper(daysAgo(900), undefined, now)).toBe(true);
  });

  it('counts a paper up to the last day of its limit', () => {
    expect(isCurrentPaper(daysAgo(90), 90, now)).toBe(true);
    expect(isCurrentPaper(daysAgo(91), 90, now)).toBe(false);
  });

  it('calls a paper too old only when it has files and none is current', () => {
    expect(isTooOld([], 90, now)).toBe(false);
    expect(isTooOld([daysAgo(120)], 90, now)).toBe(true);
    expect(isTooOld([daysAgo(120), daysAgo(5)], 90, now)).toBe(false);
    expect(isTooOld([daysAgo(120)], null, now)).toBe(false);
  });
});
