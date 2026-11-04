import { describe, expect, it } from 'vitest';
import { compareRuns, jobErrorText, missingDailyJobs, recoveredFailures } from './job-runs';

const run = (id: string, name: string, status: string, createdAt: string, subjectId = null) => ({
  id,
  name,
  status,
  createdAt: new Date(createdAt),
  subjectId: subjectId as string | null,
});

describe('job runs: recovery, missing jobs and error text', () => {
  it('marks a failure recovered once the same job later worked', () => {
    const rows = [
      run('a', 'incentive_sweep', 'failed', '2026-11-03T05:00:00Z'),
      run('b', 'incentive_sweep', 'succeeded', '2026-11-03T06:00:00Z'),
      run('c', 'incentive_sweep', 'failed', '2026-11-03T07:00:00Z'),
      run('d', 'payout_sync', 'failed', '2026-11-03T04:00:00Z'),
      run('e', 'escalations', 'succeeded', '2026-11-03T08:00:00Z'),
    ];
    expect([...recoveredFailures(rows)]).toEqual(['a']);
  });

  it('matches message delivery by the message it was about', () => {
    const rows = [
      { ...run('a', 'message_delivery', 'failed', '2026-11-03T05:00:00Z'), subjectId: 'm1' },
      { ...run('b', 'message_delivery', 'failed', '2026-11-03T05:00:00Z'), subjectId: 'm2' },
      { ...run('c', 'message_delivery', 'succeeded', '2026-11-03T06:00:00Z'), subjectId: 'm1' },
    ];
    expect([...recoveredFailures(rows)]).toEqual(['a']);
  });

  it('lists daily jobs with no run in the last 26 hours', () => {
    const now = new Date('2026-11-04T10:00:00Z');
    const last = new Map([
      ['payment_reminders', new Date('2026-11-04T03:11:00Z')],
      ['escalations', new Date('2026-11-03T03:11:00Z')],
    ]);
    const missing = missingDailyJobs(last, now);
    expect(missing).not.toContain('payment_reminders');
    expect(missing).toContain('escalations');
    expect(missing).toContain('owner_summaries');
    expect(missing).not.toContain('incentive_sweep');
  });

  it('puts unrecovered failures first, recovered ones in date order', () => {
    const runs = [
      { status: 'failed' as const, recovered: true, createdAt: '2026-11-01T03:00:00Z' },
      { status: 'succeeded' as const, createdAt: '2026-11-02T03:00:00Z' },
    ];
    expect([...runs].sort(compareRuns)[0]?.status).toBe('succeeded');
  });

  it('puts the underlying cause first and keeps a long error', () => {
    const cause = new Error('column "foo" does not exist');
    const error = new Error(`Failed query: select ${'"x", '.repeat(200)} from leads`, { cause });
    const text = jobErrorText(error);
    expect(text.startsWith('column "foo" does not exist')).toBe(true);
    expect(text).toContain('Failed query: select');
    expect(text.length).toBeGreaterThan(500);
    expect(jobErrorText('x'.repeat(5000)).length).toBe(4000);
  });
});
