import { describe, expect, it } from 'vitest';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import type { WatchedPerson } from '../workforce/duty-scope';
import { etaMinutes, type NearestFacts, nearestPeople } from './live-nearest';
import type { DayRow, PointRow } from './live-read';

const now = new Date('2026-11-16T06:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const SITE = { id: 'task1', latitude: 16.85, longitude: 74.58 };
const person = (id: string, over: Partial<WatchedPerson> = {}): WatchedPerson => ({
  id,
  fullName: `Person ${id}`,
  phone: null,
  designation: null,
  avatarSwatch: 1,
  roleName: 'Execution',
  locationOn: true,
  ...over,
});
const day = (id: string, open = true): DayRow => ({
  id: `d-${id}`,
  userId: id,
  workDate: '2026-11-16',
  checkInAt: ago(120),
  checkOutAt: open ? null : ago(5),
});
const last = (id: string, metresNorth: number, minutesAgo = 2): PointRow =>
  ({
    id: `p-${id}`,
    userId: id,
    attendanceDayId: `d-${id}`,
    recordedAt: ago(minutesAgo),
    latitude: SITE.latitude + metresNorth / 111_195,
    longitude: SITE.longitude,
  }) as PointRow;

function facts(ids: string[], over: Partial<NearestFacts> = {}): NearestFacts {
  return {
    site: SITE,
    people: ids.map((id) => person(id)),
    now,
    days: new Map(ids.map((id) => [id, day(id)])),
    onLeave: new Set(),
    latest: new Map(ids.map((id, index) => [`d-${id}`, last(id, (ids.length - index) * 1000)])),
    visits: [],
    ...over,
  };
}

describe('nearestPeople', () => {
  it('sorts free people by straight-line distance, with an "about" ETA at 25 km/h', () => {
    const out = nearestPeople(facts(['a', 'b', 'c']));
    expect(out.people.map((row) => row.person.id)).toEqual(['c', 'b', 'a']);
    expect(out.people[0]).toMatchObject({
      distanceM: 1000,
      etaMinutes: 2,
      etaLabel: 'about 2 min',
    });
    expect(out.siteId).toBe('task1');
  });

  it('lists at most five', () => {
    expect(nearestPeople(facts(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).people).toHaveLength(5);
  });

  it('leaves out anyone off duty, on a visit, on leave, location off or not seen for 20 min', () => {
    const base = facts(['free', 'ended', 'visiting', 'away', 'off', 'quiet']);
    const out = nearestPeople({
      ...base,
      people: base.people.map((one) => (one.id === 'off' ? { ...one, locationOn: false } : one)),
      days: new Map([...base.days, ['ended', day('ended', false)]]),
      onLeave: new Set(['away']),
      latest: new Map([...base.latest, ['d-quiet', last('quiet', 100, 25)]]),
      visits: [{ row: { userId: 'visiting', checkOutAt: null } } as unknown as VisitWithSite],
    });
    expect(out.people.map((row) => row.person.id)).toEqual(['free']);
  });
});

describe('etaMinutes', () => {
  it('is at least a minute, rounded', () => {
    expect([0, 400, 10_000].map(etaMinutes)).toEqual([1, 1, 24]);
  });
});
