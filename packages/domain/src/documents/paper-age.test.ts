import { describe, expect, it } from 'vitest';
import { isCurrentPaper, isDiscomApplication } from './paper-age';

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

  it('knows the DISCOM applications, not the subsidy one', () => {
    expect(isDiscomApplication('discom_application')).toBe(true);
    expect(isDiscomApplication('mseb_application')).toBe(true);
    expect(isDiscomApplication('subsidy_application')).toBe(false);
    expect(isDiscomApplication('discom_sanction')).toBe(false);
  });
});
