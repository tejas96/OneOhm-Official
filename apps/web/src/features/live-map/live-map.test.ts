import type { LivePerson } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import { fanOut, visibleCaptions } from './label-layout';
import {
  canSeeLiveMap,
  jobHref,
  liveCounts,
  matchesFilter,
  matchesSearch,
  pinCaption,
  sortPeople,
  whatsappHref,
} from './live-format';

const person = (name: string, state: LivePerson['state'], over: Partial<LivePerson> = {}) =>
  ({
    person: {
      id: name,
      fullName: name,
      initials: 'X',
      photoUrl: null,
      avatarSwatch: 0,
      roleLabel: 'Execution',
      phone: null,
    },
    state,
    position: null,
    tail: [],
    today: { kmSoFar: 0, visitsDone: 0, visitsPlanned: 0, currentVisit: null, dutyStartedAt: null },
    flags: { mockedToday: false },
    alerts: { open: 0, red: 0 },
    ...over,
  }) as LivePerson;

describe('live map words and filters', () => {
  it('counts on duty as visit, moving, idle and gap', () => {
    const counts = liveCounts([
      person('A', 'moving'),
      person('B', 'gap'),
      person('C', 'off_duty'),
      person('D', 'on_leave'),
    ]);
    expect(counts).toMatchObject({ on_duty: 2, moving: 1, gap: 1, off_duty: 1, on_leave: 1 });
    expect(matchesFilter('gap', 'on_duty')).toBe(true);
    expect(matchesFilter('off_duty', 'on_duty')).toBe(false);
    expect(matchesFilter('idle', 'all')).toBe(true);
  });

  it('writes the pin caption from what is known', () => {
    const ravi = person('Ravi Patil', 'moving', {
      today: {
        kmSoFar: 12.44,
        visitsDone: 1,
        visitsPlanned: 3,
        currentVisit: null,
        dutyStartedAt: null,
      },
      position: {
        latitude: 1,
        longitude: 1,
        accuracyM: 5,
        at: '',
        batteryPercent: 64,
        charging: false,
        network: 'wifi',
      },
    });
    expect(pinCaption(ravi)).toBe('Ravi · 12.4 km · 64%');
    expect(pinCaption(person('Amit', 'idle'))).toBe('Amit');
  });

  it('sorts by state then name and searches by name or role', () => {
    const sorted = sortPeople([
      person('Zed', 'on_visit'),
      person('Amy', 'off_duty'),
      person('Bo', 'on_visit'),
    ]);
    expect(sorted.map((row) => row.person.fullName)).toEqual(['Bo', 'Zed', 'Amy']);
    expect(matchesSearch(person('Ravi Patil', 'idle'), ' ravi  pat ')).toBe(true);
    expect(matchesSearch(person('Ravi Patil', 'idle'), 'execution')).toBe(true);
    expect(matchesSearch(person('Ravi Patil', 'idle'), 'sunita')).toBe(false);
  });

  it('links WhatsApp, the job and the menu entry', () => {
    expect(whatsappHref('+91 98200 00001')).toBe('https://wa.me/919820000001');
    expect(jobHref({ id: 't1', kind: 'survey', projectId: 'p1' })).toBe('/live?task=t1');
    expect(jobHref({ id: 's1', kind: 'service', projectId: null })).toContain('request=s1');
    expect(canSeeLiveMap({ capabilities: ['people.manage'] })).toBe(true);
    expect(canSeeLiveMap({ capabilities: [], hasReports: true })).toBe(true);
    expect(canSeeLiveMap({ capabilities: ['people.view'] })).toBe(false);
  });
});

describe('visibleCaptions', () => {
  it('hides a caption that would cover a more important one', () => {
    const shown = visibleCaptions([
      { id: 'a', x: 100, y: 100, text: 'Ravi · 12.4 km', priority: 1 },
      { id: 'b', x: 110, y: 104, text: 'Sunita · 3.0 km', priority: 2 },
      { id: 'c', x: 400, y: 100, text: 'Amit', priority: 0 },
    ]);
    expect([...shown].sort()).toEqual(['b', 'c']);
  });

  it('hides a caption that would run under the map buttons', () => {
    const buttons = { left: 160, right: 200, top: 100, bottom: 200 };
    const boxes = [
      { id: 'a', x: 120, y: 100, text: 'Sunita · 19.0 km · 81%', priority: 1 },
      { id: 'b', x: 40, y: 300, text: 'Amit', priority: 0 },
    ];
    expect([...visibleCaptions(boxes, [], [buttons])]).toEqual(['b']);
  });
});

describe('fanOut', () => {
  it('spreads pins at one spot on a ring and leaves a lone pin alone', () => {
    const placed = fanOut([
      { id: 'a', x: 100, y: 100 },
      { id: 'b', x: 102, y: 101 },
      { id: 'c', x: 101, y: 99 },
      { id: 'd', x: 400, y: 400 },
    ]);
    expect(placed.get('d')).toEqual({ x: 400, y: 400 });
    const ring = ['a', 'b', 'c'].map((id) => placed.get(id) ?? { x: 0, y: 0 });
    for (const [index, one] of ring.entries())
      for (const other of ring.slice(index + 1))
        expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(40);
  });
});
