import { describe, expect, it } from 'vitest';
import { distanceMeters, isLateCheckIn, nearestLocation } from './attendance';
import { leaveHalfDays, overlaps, suggestBackups } from './leave';

describe('leave days', () => {
  const sundaysOff = [0];

  it('counts working days in half days, skipping the weekly off', () => {
    // Fri 6 Nov 2026 to Mon 9 Nov 2026: Fri, Sat, Mon (Sunday off).
    expect(
      leaveHalfDays({
        from: '2026-11-06',
        to: '2026-11-09',
        halfDay: false,
        weeklyOff: sundaysOff,
      }),
    ).toBe(6);
  });

  it('counts a single half day as one half', () => {
    expect(
      leaveHalfDays({ from: '2026-11-06', to: '2026-11-06', halfDay: true, weeklyOff: sundaysOff }),
    ).toBe(1);
  });

  it('counts nothing for a weekly off or a backwards range', () => {
    expect(
      leaveHalfDays({
        from: '2026-11-08',
        to: '2026-11-08',
        halfDay: false,
        weeklyOff: sundaysOff,
      }),
    ).toBe(0);
    expect(
      leaveHalfDays({
        from: '2026-11-09',
        to: '2026-11-06',
        halfDay: false,
        weeklyOff: sundaysOff,
      }),
    ).toBe(0);
  });

  it('finds overlapping ranges, including touching ones', () => {
    expect(
      overlaps({ from: '2026-11-01', to: '2026-11-05' }, { from: '2026-11-05', to: '2026-11-07' }),
    ).toBe(true);
    expect(
      overlaps({ from: '2026-11-01', to: '2026-11-04' }, { from: '2026-11-05', to: '2026-11-07' }),
    ).toBe(false);
  });
});

describe('backup suggestions', () => {
  const person = (userId: string, roleKeys: string[], openTasks: number, onLeave = false) => ({
    userId,
    fullName: userId,
    roleKeys,
    openTasks,
    onLeave,
  });

  it('prefers a shared role, then the lightest load, and skips people away', () => {
    const picks = suggestBackups(
      ['execution'],
      [
        person('busy', ['execution'], 9),
        person('free', ['execution'], 1),
        person('away', ['execution'], 0, true),
        person('sales', ['sales'], 0),
      ],
    );
    expect(picks.map((pick) => pick.userId)).toEqual(['free', 'busy']);
  });
});

describe('attendance places', () => {
  const office = { id: 'o', name: 'Office', latitude: 16.8524, longitude: 74.5815, radiusM: 150 };

  it('measures distance in metres', () => {
    // About 1.11 km per 0.01° of latitude.
    expect(distanceMeters(office, { latitude: 16.8624, longitude: 74.5815 })).toBeGreaterThan(1100);
    expect(distanceMeters(office, office)).toBe(0);
  });

  it('counts a reading inside the radius, allowing for GPS accuracy', () => {
    const near = { latitude: 16.8536, longitude: 74.5815 }; // ~133 m north
    expect(nearestLocation(near, [office])?.inside).toBe(true);
    const farther = { latitude: 16.8542, longitude: 74.5815, accuracyM: 50 }; // ~200 m
    expect(nearestLocation(farther, [office])?.inside).toBe(true);
    expect(nearestLocation({ ...farther, accuracyM: 5 }, [office])?.inside).toBe(false);
    expect(nearestLocation(near, [])).toBeNull();
  });

  it('marks a check-in late only after the grace period', () => {
    expect(isLateCheckIn('09:44', '09:30', 15)).toBe(false);
    expect(isLateCheckIn('09:46', '09:30', 15)).toBe(true);
  });
});
