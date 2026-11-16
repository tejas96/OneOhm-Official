import { describe, expect, it } from 'vitest';
import {
  claimUnpaidTooLong,
  claimWaitingTooLong,
  DUTY_ALERT_KINDS,
  DUTY_ALERT_SEVERITY,
  gapReason,
  missedCheckIn,
  plannedVisitMissed,
  routeGapSeverity,
  silentMinutes,
  visitOpenTooLong,
} from './duty-alert-rules';

const now = new Date('2026-11-16T06:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const DAY = 24 * 60;

describe('missedCheckIn', () => {
  const base = { workingDay: true, onLeave: false, checkedIn: false, dayStartMin: 570 };

  it('fires 30 minutes after the day start on a working day, not before', () => {
    expect(missedCheckIn({ ...base, nowMin: 599 })).toBe(false);
    expect(missedCheckIn({ ...base, nowMin: 600 })).toBe(true);
  });

  it('never fires on a day off, on leave, or once checked in', () => {
    expect(missedCheckIn({ ...base, nowMin: 700, workingDay: false })).toBe(false);
    expect(missedCheckIn({ ...base, nowMin: 700, onLeave: true })).toBe(false);
    expect(missedCheckIn({ ...base, nowMin: 700, checkedIn: true })).toBe(false);
  });
});

describe('route gap', () => {
  it('counts silence from the last point, or the check-in with none', () => {
    expect(silentMinutes({ dutyStartedAt: ago(90), lastPointAt: ago(25), now })).toBe(25);
    expect(silentMinutes({ dutyStartedAt: ago(30), lastPointAt: null, now })).toBe(30);
  });

  it('is nothing up to 20 minutes, amber over it, red over 60', () => {
    expect([20, 21, 60, 61].map(routeGapSeverity)).toEqual([null, 'amber', 'amber', 'red']);
  });
});

describe('visit and claim rules', () => {
  it('flags a visit open over 4 hours', () => {
    expect(visitOpenTooLong(ago(240), now)).toBe(false);
    expect(visitOpenTooLong(ago(241), now)).toBe(true);
  });

  it('misses a planned visit 30 minutes after its start when nobody came', () => {
    expect(plannedVisitMissed({ plannedStartMin: 600, nowMin: 629, arrived: false })).toBe(false);
    expect(plannedVisitMissed({ plannedStartMin: 600, nowMin: 630, arrived: false })).toBe(true);
    expect(plannedVisitMissed({ plannedStartMin: 600, nowMin: 700, arrived: true })).toBe(false);
    expect(plannedVisitMissed({ plannedStartMin: null, nowMin: 700, arrived: false })).toBe(false);
  });

  it('flags a claim waiting over 2 days and an approved one unpaid over 7', () => {
    expect(claimWaitingTooLong(ago(2 * DAY), now)).toBe(false);
    expect(claimWaitingTooLong(ago(2 * DAY + 1), now)).toBe(true);
    expect(claimUnpaidTooLong(ago(7 * DAY), now)).toBe(false);
    expect(claimUnpaidTooLong(ago(7 * DAY + 1), now)).toBe(true);
  });

  it('gives every kind a colour, fake GPS and a missed visit red', () => {
    expect(DUTY_ALERT_KINDS.every((kind) => DUTY_ALERT_SEVERITY[kind])).toBe(true);
    expect(DUTY_ALERT_SEVERITY.fake_gps).toBe('red');
    expect(DUTY_ALERT_SEVERITY.visit_missed).toBe('red');
  });
});

describe('gapReason', () => {
  const reading = { batteryPercent: 60, charging: false, network: 'cellular' };

  it('reads the last point: low battery, then no network, else unknown', () => {
    expect(gapReason({ ...reading, batteryPercent: 12 }, true)).toBe('low_battery');
    expect(gapReason({ ...reading, batteryPercent: 12, charging: true }, true)).toBe('unknown');
    expect(gapReason({ ...reading, network: 'none' }, true)).toBe('no_network');
    expect(gapReason(reading, true)).toBe('unknown');
    expect(gapReason(null, true)).toBe('unknown');
  });

  it('says location off when location is off or consent withdrawn', () => {
    expect(gapReason(reading, false)).toBe('location_off');
  });
});
