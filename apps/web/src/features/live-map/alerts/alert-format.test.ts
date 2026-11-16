import type { DutyAlert, LivePerson, LiveSite } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  agoParts,
  alertCounts,
  alertSiteId,
  alertTarget,
  canSendNearest,
  newestOfKind,
  sortAlerts,
} from './alert-format';

const alert = (id: string, over: Partial<DutyAlert> = {}): DutyAlert => ({
  id,
  kind: 'unknown_stop',
  severity: 'amber',
  day: '2026-11-16',
  title: 'x',
  person: { id: 'p1', fullName: 'Ravi Patil', phone: null },
  subject: { type: 'person', id: 'p1', label: null },
  detail: {},
  createdAt: '2026-11-16T05:00:00.000Z',
  seenAt: null,
  seenBy: null,
  resolvedAt: null,
  resolvedReason: null,
  ...over,
});

describe('alert feed order', () => {
  it('puts red before amber, newest first within each', () => {
    const sorted = sortAlerts([
      alert('a-old', { createdAt: '2026-11-16T04:00:00.000Z' }),
      alert('r-old', { severity: 'red', createdAt: '2026-11-16T03:00:00.000Z' }),
      alert('a-new', { createdAt: '2026-11-16T06:00:00.000Z' }),
      alert('r-new', { severity: 'red', createdAt: '2026-11-16T05:30:00.000Z' }),
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['r-new', 'r-old', 'a-new', 'a-old']);
  });

  it('keeps a steady order for alerts raised at the same moment', () => {
    expect(sortAlerts([alert('b'), alert('a')]).map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('counts open and red alerts and finds the newest of a kind', () => {
    const list = [
      alert('1', { severity: 'red', kind: 'fake_gps' }),
      alert('2', { kind: 'fake_gps', createdAt: '2026-11-16T07:00:00.000Z' }),
      alert('3'),
    ];
    expect(alertCounts(list)).toEqual({ open: 3, red: 1 });
    expect(newestOfKind(list, 'fake_gps')?.id).toBe('2');
    expect(newestOfKind(list, 'visit_missed')).toBeNull();
  });
});

describe('where an alert points', () => {
  const site = { id: 's1', latitude: 16.8, longitude: 74.6 } as LiveSite;
  const person = {
    person: { id: 'p1' },
    position: { latitude: 16.9, longitude: 74.5 },
  } as LivePerson;
  const missed = alert('m', {
    kind: 'visit_missed',
    severity: 'red',
    subject: { type: 'task', id: 's1', label: 'Survey' },
  });

  it('goes to the site of a missed visit, which offers Send nearest', () => {
    expect(alertSiteId(missed)).toBe('s1');
    expect(canSendNearest(missed)).toBe(true);
    expect(alertTarget(missed, [person], [site])).toEqual({
      kind: 'site',
      id: 's1',
      at: { lat: 16.8, lng: 74.6 },
    });
  });

  it('goes to the person for an alert about their day', () => {
    const stop = alert('s');
    expect(canSendNearest(stop)).toBe(false);
    expect(alertTarget(stop, [person], [site])).toEqual({
      kind: 'person',
      id: 'p1',
      at: { lat: 16.9, lng: 74.5 },
    });
    expect(alertTarget(stop, [], []).at).toBeNull();
  });

  it('says how long ago in whole units', () => {
    const now = new Date('2026-11-16T05:00:00.000Z').getTime();
    expect(agoParts('2026-11-16T04:59:30.000Z', now)).toEqual({ unit: 'now', n: 0 });
    expect(agoParts('2026-11-16T04:48:00.000Z', now)).toEqual({ unit: 'min', n: 12 });
    expect(agoParts('2026-11-16T02:00:00.000Z', now)).toEqual({ unit: 'h', n: 3 });
    expect(agoParts('2026-11-14T05:00:00.000Z', now)).toEqual({ unit: 'd', n: 2 });
  });
});
