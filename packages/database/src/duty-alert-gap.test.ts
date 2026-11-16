import { describe, expect, it } from 'vitest';
import {
  checkRouteGap,
  type DaySilence,
  daySilence,
  type GapPoint,
  gapStep,
} from './duty-alert-gap';

const T0 = new Date('2026-11-16T04:00:00Z');
const min = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);
const day = { id: 'd1', userId: 'u1', workDate: '2026-11-16', checkInAt: min(0), checkOutAt: null };
const point = (minute: number, over: Partial<GapPoint> = {}): GapPoint => ({
  recordedAt: min(minute),
  batteryPercent: 80,
  charging: false,
  network: 'cellular',
  ...over,
});
const on = { on: true, consentedAt: min(-600) };
const silence = (quietNow: number, longest = quietNow, since = min(0)): DaySilence => ({
  longest: { minutes: longest, reason: 'unknown' },
  quietNow,
  quietSince: since,
});

describe('daySilence', () => {
  it('finds the longest silence and the one going on now', () => {
    const result = daySilence(day, [point(2), point(40), point(42)], min(50), on);
    expect(result.longest.minutes).toBe(38);
    expect(result.quietNow).toBe(8);
    expect(result.quietSince).toEqual(min(42));
  });

  it('leaves out mocked, vague and future points', () => {
    const points = [point(5, { mocked: true }), point(6, { accuracyM: 5000 }), point(90)];
    const result = daySilence(day, points, min(30), on);
    expect(result.quietNow).toBe(30);
    expect(result.quietSince).toEqual(min(0));
  });

  it('gives location_off for a silence that began before consent was given again', () => {
    const result = daySilence(day, [point(2), point(60)], min(62), {
      on: true,
      consentedAt: min(55),
    });
    expect(result.longest.reason).toBe('location_off');
    const kept = daySilence(day, [point(2, { batteryPercent: 10 }), point(60)], min(62), on);
    expect(kept.longest.reason).toBe('low_battery');
  });
});

describe('gapStep', () => {
  it('raises over 20 minutes, red over an hour, and resolved when it has ended', () => {
    expect(gapStep(null, silence(15))).toEqual({ do: 'none' });
    expect(gapStep(null, silence(25))).toEqual({ do: 'raise', severity: 'amber', ended: false });
    expect(gapStep(null, silence(5, 70))).toEqual({ do: 'raise', severity: 'red', ended: true });
  });

  it('resolves an open one when points come again, keeping red', () => {
    const stored = { severity: 'red' as const, resolvedAt: null, resolvedBy: null };
    expect(gapStep(stored, silence(3, 30))).toEqual({ do: 'resolve', red: true });
  });

  it('opens one the system closed again for a new silence', () => {
    const stored = { severity: 'amber' as const, resolvedAt: min(30), resolvedBy: null };
    expect(gapStep(stored, silence(25, 25, min(29)))).toEqual({ do: 'open', red: false });
  });

  it('does not overrule a person: opens again only for a silence that began after they closed it', () => {
    const stored = { severity: 'amber' as const, resolvedAt: min(30), resolvedBy: 'manager' };
    expect(gapStep(stored, silence(40, 40, min(10)))).toEqual({ do: 'none' });
    expect(gapStep(stored, silence(25, 25, min(45)))).toEqual({ do: 'open', red: false });
  });
});

describe('checkRouteGap', () => {
  const untouched = new Proxy(
    {},
    {
      get: () => {
        throw new Error('no query expected');
      },
    },
  ) as never;

  it('skips a person whose location is not being read, and a day with no usable point', async () => {
    expect(
      await checkRouteGap(untouched, day, [point(2)], { on: false, consentedAt: null }, min(60)),
    ).toBe(false);
    expect(await checkRouteGap(untouched, day, [point(2, { mocked: true })], on, min(60))).toBe(
      false,
    );
  });
});
