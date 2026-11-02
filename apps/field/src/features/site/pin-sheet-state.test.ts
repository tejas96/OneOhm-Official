import { describe, expect, it } from 'vitest';
import { MAP_GIVE_UP_MS, nextMapState, regionAround } from './pin-sheet-state';

describe('nextMapState', () => {
  it('is ready once the map says so', () => {
    expect(nextMapState('loading', { type: 'mapReady' })).toBe('ready');
  });
  it('fails after 8 s of loading', () => {
    expect(MAP_GIVE_UP_MS).toBe(8000);
    expect(nextMapState('loading', { type: 'elapsed', ms: 7999 })).toBe('loading');
    expect(nextMapState('loading', { type: 'elapsed', ms: 8000 })).toBe('failed');
  });
  it('never goes from ready to failed', () => {
    expect(nextMapState('ready', { type: 'elapsed', ms: 60_000 })).toBe('ready');
  });
  it('a late map load after failing makes it ready', () => {
    expect(nextMapState('failed', { type: 'mapReady' })).toBe('ready');
  });
});

describe('regionAround', () => {
  it('spans about 40 m around the point', () => {
    const region = regionAround({ latitude: 0, longitude: 10 }, 40);
    expect(region.latitude).toBe(0);
    expect(region.longitude).toBe(10);
    expect(region.latitudeDelta * 111_320).toBeCloseTo(40, 5);
    expect(region.longitudeDelta).toBeCloseTo(region.latitudeDelta, 8);
  });
  it('widens the longitude span away from the equator', () => {
    const region = regionAround({ latitude: 60, longitude: 0 }, 40);
    expect(region.longitudeDelta).toBeCloseTo(region.latitudeDelta * 2, 8);
  });
});
