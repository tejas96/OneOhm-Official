import { describe, expect, it } from 'vitest';
import {
  canForceCloseVisit,
  marksPlannedVisitDone,
  pickPlannedVisit,
  visitCloseAt,
} from './site-visit-rules';

describe('pickPlannedVisit (S6)', () => {
  const day = '2026-11-15';
  it('links the confirmed visit of that day', () => {
    expect(
      pickPlannedVisit(
        [
          { id: 'p', status: 'proposed', day },
          { id: 'c', status: 'confirmed', day },
        ],
        day,
      ),
    ).toBe('c');
  });
  it('falls back to a proposed one', () =>
    expect(pickPlannedVisit([{ id: 'p', status: 'proposed', day }], day)).toBe('p'));
  it('ignores other days and finished or cancelled visits', () => {
    expect(
      pickPlannedVisit(
        [
          { id: 'a', status: 'confirmed', day: '2026-11-16' },
          { id: 'b', status: 'done', day },
          { id: 'c', status: 'cancelled', day },
        ],
        day,
      ),
    ).toBeNull();
  });
});

describe('marksPlannedVisitDone (S6)', () => {
  it('marks only a confirmed visit', () => {
    expect(marksPlannedVisitDone('confirmed')).toBe(true);
    for (const status of ['proposed', 'done', 'missed', 'cancelled', null, undefined])
      expect(marksPlannedVisitDone(status)).toBe(false);
  });
});

describe('visitCloseAt (S1)', () => {
  it('never closes before the check-in', () => {
    const checkIn = new Date('2026-11-15T10:00:00Z');
    expect(visitCloseAt(checkIn, new Date('2026-11-15T09:00:00Z'))).toEqual(checkIn);
    const later = new Date('2026-11-15T12:00:00Z');
    expect(visitCloseAt(checkIn, later)).toEqual(later);
  });
});

describe('canForceCloseVisit (S1)', () => {
  const none = new Set<never>();
  const base = {
    service: false,
    capabilities: none,
    isProjectManager: false,
    isReportingManager: false,
  };
  it('refuses someone with no part in the work', () =>
    expect(canForceCloseVisit(base)).toBe(false));
  it('allows the project manager and the person’s own manager', () => {
    expect(canForceCloseVisit({ ...base, isProjectManager: true })).toBe(true);
    expect(canForceCloseVisit({ ...base, isReportingManager: true })).toBe(true);
  });
  it('uses projects.manage for site tasks and service.manage for requests', () => {
    expect(canForceCloseVisit({ ...base, capabilities: new Set(['projects.manage']) })).toBe(true);
    expect(canForceCloseVisit({ ...base, capabilities: new Set(['service.manage']) })).toBe(false);
    expect(
      canForceCloseVisit({ ...base, service: true, capabilities: new Set(['service.manage']) }),
    ).toBe(true);
    expect(
      canForceCloseVisit({ ...base, service: true, capabilities: new Set(['projects.manage']) }),
    ).toBe(false);
  });
});
