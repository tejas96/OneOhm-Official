import { describe, expect, it } from 'vitest';
import {
  bucketIndexOf,
  granularityFor,
  onTimeRate,
  reportBuckets,
  reportRange,
  share,
} from './report-periods';

describe('reportRange', () => {
  it('covers this month, the last 30 days, the quarter and the financial year', () => {
    expect(reportRange('this_month', '2026-11-15')).toEqual({
      start: '2026-11-01',
      end: '2026-11-15',
    });
    expect(reportRange('last_30_days', '2026-11-15').start).toBe('2026-10-17');
    expect(reportRange('this_quarter', '2026-11-15').start).toBe('2026-10-01');
    expect(reportRange('this_year', '2026-11-15').start).toBe('2026-04-01');
    expect(reportRange('this_year', '2027-02-10').start).toBe('2026-04-01');
  });
});

describe('reportBuckets', () => {
  it('uses weeks for a month and months for longer', () => {
    expect(granularityFor({ start: '2026-11-01', end: '2026-11-30' })).toBe('week');
    expect(granularityFor({ start: '2026-04-01', end: '2026-11-15' })).toBe('month');
  });

  it('clips Monday-to-Sunday weeks to the range', () => {
    const weeks = reportBuckets({ start: '2026-11-01', end: '2026-11-15' }, 'week');
    expect(weeks[0]).toEqual({ start: '2026-11-01', end: '2026-11-01' });
    expect(weeks[1]).toEqual({ start: '2026-11-02', end: '2026-11-08' });
    expect(weeks.at(-1)).toEqual({ start: '2026-11-09', end: '2026-11-15' });
  });

  it('splits a financial year into months', () => {
    const months = reportBuckets({ start: '2026-04-01', end: '2027-01-10' }, 'month');
    expect(months).toHaveLength(10);
    expect(months.at(-1)).toEqual({ start: '2027-01-01', end: '2027-01-10' });
    expect(bucketIndexOf(months, '2026-12-31')).toBe(8);
    expect(bucketIndexOf(months, '2027-02-01')).toBe(-1);
  });
});

describe('rates', () => {
  it('never shows 0% for nothing finished', () => {
    expect(onTimeRate(0, 0)).toBeNull();
    expect(onTimeRate(3, 1)).toBe(0.75);
    expect(share(1, 0)).toBeNull();
  });
});
