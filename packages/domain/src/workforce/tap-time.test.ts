import { describe, expect, it } from 'vitest';
import { canResumeDay, judgeTap } from './tap-time';

const now = new Date('2026-11-15T10:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);

describe('which tap time is kept', () => {
  const at = (verdict: ReturnType<typeof judgeTap>) => (verdict.ok ? verdict.at : null);

  it('uses a tap within 30 minutes with no flag', () => {
    expect(judgeTap(ago(30), now)).toEqual({ ok: true, at: ago(30), delayed: false });
    expect(judgeTap(ago(5), now)).toEqual({ ok: true, at: ago(5), delayed: false });
  });

  it('uses a tap 30 minutes to 12 hours old and flags it as delayed', () => {
    expect(judgeTap(ago(31), now)).toEqual({ ok: true, at: ago(31), delayed: true });
    expect(judgeTap(ago(12 * 60), now)).toEqual({ ok: true, at: ago(12 * 60), delayed: true });
  });

  it('uses the server time when there is none', () => {
    for (const none of [null, undefined, new Date('nope')])
      expect(judgeTap(none, now)).toEqual({ ok: true, at: now, delayed: false });
  });

  it('refuses a tap older than 12 hours', () => {
    expect(judgeTap(ago(12 * 60 + 1), now)).toEqual({ ok: false, code: 'tap_too_old' });
  });

  it('allows 2 minutes of skew (recorded as now) and refuses a tap further ahead', () => {
    expect(judgeTap(ago(-2), now)).toEqual({ ok: true, at: now, delayed: false });
    expect(judgeTap(ago(-3), now)).toEqual({ ok: false, code: 'tap_in_future' });
  });

  it('uses the server time for a tap before the open check-in', () => {
    expect(at(judgeTap(ago(60), now, ago(30)))).toEqual(now);
    expect(at(judgeTap(ago(20), now, ago(30)))).toEqual(ago(20));
  });
});

describe('who may resume duty', () => {
  const day = {
    workDate: '2026-11-15',
    checkOutAt: new Date(),
    autoClosedAt: null,
    correctedAt: null,
  };
  it('allows a person-made check-out on the same day', () => {
    expect(canResumeDay(day, '2026-11-15')).toBe(true);
  });
  it('refuses an open, earlier, auto-closed or corrected day', () => {
    expect(canResumeDay(null, '2026-11-15')).toBe(false);
    expect(canResumeDay({ ...day, checkOutAt: null }, '2026-11-15')).toBe(false);
    expect(canResumeDay(day, '2026-11-16')).toBe(false);
    expect(canResumeDay({ ...day, autoClosedAt: new Date() }, '2026-11-15')).toBe(false);
    expect(canResumeDay({ ...day, correctedAt: new Date() }, '2026-11-15')).toBe(false);
  });
});
