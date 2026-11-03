import { describe, expect, it } from 'vitest';
import {
  MAP_GIVE_UP_MS,
  nextMapState,
  regionAround,
  sheetActions,
  zoomAround,
} from './pin-sheet-state';

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

describe('zoomAround', () => {
  it('turns a 40 m span into the zoom whose view is that wide', () => {
    const point = { latitude: 18.5, longitude: 73.8 };
    const zoom = zoomAround(point, 40);
    expect(360 / 2 ** zoom).toBeCloseTo(regionAround(point, 40).longitudeDelta, 10);
  });
  it('zooms in further when the view is several tiles wide (Google Maps)', () => {
    const point = { latitude: 0, longitude: 0 };
    expect(zoomAround(point, 40, 2) - zoomAround(point, 40)).toBeCloseTo(1, 10);
  });
});

describe('sheetActions', () => {
  const empty = { hasSaved: false, canSetSite: true, hasStart: true };
  const noCheckInFix = { hasSaved: false, canSetSite: false, hasStart: true };
  const noReading = { hasSaved: false, canSetSite: false, hasStart: false };
  const saved = { hasSaved: true, canSetSite: false, hasStart: true };

  it('offers the roof and the check-in reading when no point is saved', () => {
    expect(sheetActions('ready', empty)).toEqual({
      message: null,
      primary: { label: 'This is the roof', action: 'confirm' },
      secondary: { label: 'Use my GPS reading', action: 'gps' },
    });
    expect(sheetActions('failed', empty)).toEqual({
      message: null,
      primary: { label: 'Map not loading. Use my GPS reading', action: 'gps' },
      secondary: null,
    });
  });
  it('keeps the check-in path when the visit has a point, even with no fresh reading', () => {
    expect(sheetActions('failed', { ...empty, hasStart: false }).primary.action).toBe('gps');
  });
  it('sends the fresh reading as a pin when the check-in had no fix', () => {
    expect(sheetActions('ready', noCheckInFix)).toEqual({
      message: null,
      primary: { label: 'This is the roof', action: 'confirm' },
      secondary: { label: 'Use my GPS reading', action: 'gpsPin' },
    });
    expect(sheetActions('failed', noCheckInFix)).toEqual({
      message: null,
      primary: { label: 'Map not loading. Use my GPS reading', action: 'gpsPin' },
      secondary: null,
    });
  });
  it('only offers Close when there is no reading to use at all', () => {
    expect(sheetActions('loading', noReading)).toEqual({
      message: null,
      primary: { label: 'This is the roof', action: 'confirm' },
      secondary: null,
    });
    expect(sheetActions('failed', noReading)).toEqual({
      message: 'Map not loading.',
      primary: { label: 'Close', action: 'close' },
      secondary: null,
    });
  });
  it('never offers the GPS reading when a point is saved (it would be refused)', () => {
    for (const facts of [saved, { ...saved, canSetSite: true }, { ...saved, hasStart: false }]) {
      expect(sheetActions('loading', facts)).toEqual({
        message: null,
        primary: { label: 'This is the roof', action: 'confirm' },
        secondary: null,
      });
      expect(sheetActions('failed', facts)).toEqual({
        message: 'Map not loading.',
        primary: { label: 'Keep the saved location', action: 'close' },
        secondary: null,
      });
    }
  });
});
