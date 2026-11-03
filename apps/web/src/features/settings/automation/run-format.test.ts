import { describe, expect, it } from 'vitest';
import { minutesAndSeconds, took } from './run-format';

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
