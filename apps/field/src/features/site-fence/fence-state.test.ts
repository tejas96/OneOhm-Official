import type { DutySiteRecord } from '@oneohm/api-contracts';
import { describe, expect, it } from 'vitest';
import {
  discardPending,
  dropStalePending,
  dueArrival,
  EMPTY_STATE,
  enterSite,
  hasPending,
  markClosed,
  markNear,
  markOpen,
  markRegistered,
  markShown,
  nearKey,
  parseState,
  wasNear,
  wasShown,
} from './fence-state';

const site = (id: string, latitude: number): DutySiteRecord => ({
  id,
  kind: 'installation',
  label: id,
  latitude,
  longitude: 74.58,
  radiusM: 150,
});
const sites = [site('t1', 16.85)];
const entered = '2026-11-16T05:00:00.000Z';
const base = new Date(entered).getTime();
const here: { latitude: number; longitude: number; accuracyM: number | null; mocked: boolean } = {
  latitude: 16.85,
  longitude: 74.58,
  accuracyM: 20,
  mocked: false,
};
const state = enterSite(EMPTY_STATE, 't1', entered);
const due = (patch: Partial<typeof here & { at: number }>) =>
  dueArrival(state, { ...here, at: base + 5 * 60_000, ...patch }, sites);

describe('the dwell before a check-in', () => {
  it('confirms a good reading inside the fence after five minutes', () => {
    expect(due({})?.site.id).toBe('t1');
  });
  it('waits: four minutes is a drive-past', () => {
    expect(due({ at: base + 4 * 60_000 })).toBeNull();
  });
  it('is not confirmed outside the fence, by a fake or a poor reading, or one before the Enter', () => {
    expect(due({ latitude: 16.86 })).toBeNull();
    expect(due({ mocked: true })).toBeNull();
    expect(due({ accuracyM: 101 })).toBeNull();
    expect(due({ accuracyM: null })).toBeNull();
    expect(due({ at: base - 60_000 })).toBeNull();
  });
});

describe('the remembered state', () => {
  it('discards a pending arrival on exit, and knows what is pending', () => {
    expect(hasPending(state, 't1')).toBe(true);
    expect(hasPending(discardPending(state, 't1'), 't1')).toBe(false);
  });
  it('replaces a pending arrival for the same site', () => {
    expect(enterSite(state, 't1', '2026-11-16T06:00:00.000Z').pending).toHaveLength(1);
  });
  it('forgets arrivals older than three hours', () => {
    expect(dropStalePending(state, base + 4 * 3_600_000).pending).toEqual([]);
    expect(dropStalePending(state, base + 3_600_000).pending).toHaveLength(1);
  });
  it('tracks open sites', () => {
    expect(markOpen(EMPTY_STATE, 't1').open).toEqual(['t1']);
    expect(markClosed(markOpen(EMPTY_STATE, 't1'), 't1').open).toEqual([]);
  });
  it('asks "why" once per visit and warns about close sites once', () => {
    expect(wasShown(markShown(EMPTY_STATE, 'v1'), 'v1')).toBe(true);
    expect(wasShown(EMPTY_STATE, 'v1')).toBe(false);
    const key = nearKey([site('b', 1), site('a', 1)]);
    expect(key).toBe('a|b');
    expect(wasNear(markNear(EMPTY_STATE, key), key)).toBe(true);
  });
  it('keeps the registered region key, and reads a damaged file as empty', () => {
    expect(markRegistered(EMPTY_STATE, 'k').registered).toBe('k');
    expect(parseState('nope')).toEqual(EMPTY_STATE);
    expect(parseState({ pending: [{ siteId: 1 }], open: ['a', 2], registered: 'k' })).toMatchObject(
      {
        pending: [],
        open: ['a'],
        registered: 'k',
      },
    );
  });
});
