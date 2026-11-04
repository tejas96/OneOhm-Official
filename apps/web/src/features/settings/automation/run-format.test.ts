import { describe, expect, it } from 'vitest';
import { minutesAndSeconds, needsAttention, runsTodaysJob, took } from './run-format';

describe('took', () => {
  it('is the gap between start and finish', () => {
    expect(
      took({ startedAt: '2026-11-03T10:00:00.000Z', finishedAt: '2026-11-03T10:00:02.500Z' }),
    ).toBe(2500);
  });

  it('is null until the run has started and finished', () => {
    expect(took({ startedAt: null, finishedAt: null })).toBeNull();
    expect(took({ startedAt: '2026-11-03T10:00:00.000Z', finishedAt: null })).toBeNull();
  });

  it('never goes below zero', () => {
    expect(
      took({ startedAt: '2026-11-03T10:00:05.000Z', finishedAt: '2026-11-03T10:00:00.000Z' }),
    ).toBe(0);
  });
});

describe('minutesAndSeconds', () => {
  it('splits and rounds', () => {
    expect(minutesAndSeconds(500)).toEqual({ minutes: 0, seconds: 1 });
    expect(minutesAndSeconds(75_400)).toEqual({ minutes: 1, seconds: 15 });
    expect(minutesAndSeconds(120_000)).toEqual({ minutes: 2, seconds: 0 });
  });
});

describe('needsAttention and runsTodaysJob', () => {
  const now = new Date('2026-11-04T06:00:00.000Z');
  const base = {
    name: 'payment_reminders' as const,
    status: 'failed' as const,
    recovered: false,
    createdAt: '2026-11-02T03:11:00.000Z',
  };

  it('a recovered failure needs nobody', () => {
    expect(needsAttention(base)).toBe(true);
    expect(needsAttention({ ...base, recovered: true })).toBe(false);
    expect(needsAttention({ ...base, status: 'succeeded' })).toBe(false);
  });

  it('a daily job from an earlier day runs today’s job again', () => {
    expect(runsTodaysJob(base, now)).toBe(true);
    expect(runsTodaysJob({ ...base, createdAt: '2026-11-04T03:11:00.000Z' }, now)).toBe(false);
    expect(runsTodaysJob({ ...base, name: 'message_delivery' }, now)).toBe(false);
  });
});
