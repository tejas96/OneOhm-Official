import { describe, expect, it } from 'vitest';
import { distanceMeters, isLateCheckIn, nearestLocation } from './attendance';
import { dateRangesOverlap, leaveHalfDays, suggestBackups } from './leave';

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
      dateRangesOverlap(
        { from: '2026-11-01', to: '2026-11-05' },
        { from: '2026-11-05', to: '2026-11-07' },
      ),
    ).toBe(true);
    expect(
      dateRangesOverlap(
        { from: '2026-11-01', to: '2026-11-04' },
        { from: '2026-11-05', to: '2026-11-07' },
      ),
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

  it('counts a reading inside only when the whole accuracy circle fits the fence', () => {
    const near = { latitude: 16.8536, longitude: 74.5815 }; // ~133 m north
    expect(nearestLocation(near, [office])?.inside).toBe(true);
    expect(nearestLocation({ ...near, accuracyM: 10 }, [office])?.inside).toBe(true);
    // 133 m + 30 m of doubt reaches past the 150 m fence: unsure, never inside.
    expect(nearestLocation({ ...near, accuracyM: 30 }, [office])?.inside).toBeNull();
    expect(nearestLocation(near, [])).toBeNull();
  });

  it('does not let poor accuracy make a far reading inside', () => {
    const farther = { latitude: 16.8542, longitude: 74.5815 }; // ~200 m
    expect(nearestLocation({ ...farther, accuracyM: 5 }, [office])?.inside).toBe(false);
    // The old rule added 50 m of slack to the radius and called this inside.
    expect(nearestLocation({ ...farther, accuracyM: 50 }, [office])?.inside).toBeNull();
    expect(nearestLocation({ ...farther, accuracyM: 5000 }, [office])?.inside).toBeNull();
  });

  it('is inside when any place contains the point, not only the nearest', () => {
    // A wide yard whose centre is farther than the small office, but whose fence holds it.
    const yard = { id: 'y', name: 'Yard', latitude: 16.8554, longitude: 74.5815, radiusM: 600 };
    const small = { id: 's', name: 'Gate', latitude: 16.8546, longitude: 74.5815, radiusM: 20 };
    const point = { latitude: 16.8549, longitude: 74.5815, accuracyM: 3 };
    const match = nearestLocation(point, [small, yard]);
    expect(match?.location.id).toBe('y');
    expect(match?.inside).toBe(true);
  });

  it('prefers unsure over outside when no place clearly holds the point', () => {
    const point = { latitude: 16.8542, longitude: 74.5815, accuracyM: 60 }; // ~200 m from office
    const faraway = { id: 'f', name: 'Far', latitude: 17.5, longitude: 75, radiusM: 100 };
    expect(nearestLocation(point, [faraway, office])?.inside).toBeNull();
    expect(nearestLocation(point, [faraway, office])?.location.id).toBe('o');
  });

  it('marks a check-in late only after the grace period', () => {
    expect(isLateCheckIn('09:44', '09:30', 15)).toBe(false);
    expect(isLateCheckIn('09:46', '09:30', 15)).toBe(true);
  });
});
