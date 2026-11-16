import { describe, expect, it } from 'vitest';
import type { VisitWithSite } from '../site-activity/site-visit-read';
import type { WatchedPerson } from '../workforce/duty-scope';
import { initialsOf, livePerson, type PersonFacts } from './live-person';
import type { DayRow, PointRow } from './live-read';
import { minutesInZone } from './live-sites';

const now = new Date('2026-11-16T06:00:00Z');
const ago = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const person: WatchedPerson = {
  id: 'w1',
  fullName: 'Ravi Patil',
  phone: '+919800000001',
  designation: null,
  avatarSwatch: 2,
  roleName: 'Execution',
  locationOn: true,
};
const day: DayRow = {
  id: 'd1',
  userId: 'w1',
  workDate: '2026-11-16',
  checkInAt: ago(90),
  checkOutAt: null,
};
const point = (minutesAgo: number, north: number, over: Partial<PointRow> = {}): PointRow =>
  ({
    id: `p${minutesAgo}`,
    userId: 'w1',
    attendanceDayId: 'd1',
    recordedAt: ago(minutesAgo),
    latitude: 16.85 + north / 111_195,
    longitude: 74.58,
    accuracyM: 10,
    speedMps: 8,
    headingDeg: 0,
    altitudeM: null,
    mocked: false,
    batteryPercent: 64,
    charging: false,
    network: 'cellular',
    receivedAt: now,
    ...over,
  }) as PointRow;
const facts = (over: Partial<PersonFacts> = {}): PersonFacts => ({
  person,
  now,
  day,
  recent: [point(20, 2000), point(2, 4000)],
  latest: point(2, 4000),
  km: { km: 4, mockedToday: false },
  onLeave: false,
  visits: [],
  siteIds: new Set(['t1', 't2']),
  ...over,
});

describe('livePerson', () => {
  it('shows a moving worker with position, tail, km and battery', () => {
    const out = livePerson(facts());
    expect(out.state).toBe('moving');
    expect(out.person).toMatchObject({
      initials: 'RP',
      roleLabel: 'Execution',
      phone: person.phone,
    });
    expect(out.position).toMatchObject({ batteryPercent: 64, network: 'cellular' });
    expect(out.tail).toHaveLength(2);
    expect(out.today.kmSoFar).toBe(4);
    expect(out.today).toMatchObject({ visitsDone: 0, visitsPlanned: 2, currentVisit: null });
  });

  it('gives an off-duty person no position and no tail', () => {
    const out = livePerson(facts({ day: { ...day, checkOutAt: ago(10) } }));
    expect(out.state).toBe('off_duty');
    expect(out.position).toBeNull();
    expect(out.tail).toEqual([]);
    expect(out.today.dutyStartedAt).toBeNull();
  });

  it('reads nothing from the route with location off', () => {
    const out = livePerson(facts({ person: { ...person, locationOn: false } }));
    expect(out.state).toBe('location_off');
    expect(out).toMatchObject({ position: null, tail: [], flags: { mockedToday: null } });
    expect(out.today.kmSoFar).toBeNull();
  });

  it('never places someone at a mocked point', () => {
    const out = livePerson(facts({ recent: [point(5, 0), point(2, 300, { mocked: true })] }));
    expect(out.position?.latitude).toBeCloseTo(16.85, 5);
  });

  it('shows where a quiet person was last seen, as a gap', () => {
    const out = livePerson(facts({ recent: [], latest: point(45, 100) }));
    expect(out.state).toBe('gap');
    expect(out.position?.at).toBe(ago(45).toISOString());
    expect(out.tail).toEqual([]);
  });

  it('counts an open visit as now and a closed one of today as done', () => {
    const visit = (id: string, out: Date | null) =>
      ({
        row: {
          userId: 'w1',
          taskId: id,
          serviceRequestId: null,
          workDate: '2026-11-16',
          checkInAt: ago(30),
          checkOutAt: out,
          kind: 'survey',
        },
        record: { taskTitle: `Survey ${id}`, siteLabel: 'Home' },
        site: null,
      }) as unknown as VisitWithSite;
    const out = livePerson(facts({ visits: [visit('t1', null), visit('t3', ago(60))] }));
    expect(out.state).toBe('on_visit');
    expect(out.today.currentVisit).toEqual({ label: 'Survey t1', since: ago(30).toISOString() });
    expect(out.today).toMatchObject({ visitsDone: 1, visitsPlanned: 3 });
  });
});

describe('helpers', () => {
  it('makes initials and business-time minutes', () => {
    expect(initialsOf('Sales (test)')).toBe('S');
    expect(initialsOf('Amit Kumar Shah')).toBe('AS');
    expect(minutesInZone(new Date('2026-11-16T04:30:00Z'), 'Asia/Kolkata')).toBe(600);
  });
});
