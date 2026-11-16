import { describe, expect, it } from 'vitest';
import {
  cameraAt,
  fitCamera,
  fromWorld,
  screensApart,
  stepZoom,
  toWorld,
  zoomAround,
} from './camera-math';

const SIZE = { width: 1000, height: 800 };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const LIMITS = { min: 4, max: 20 };
const SANGLI = { lat: 16.85, lng: 74.58 };

describe('world projection', () => {
  it('goes there and back', () => {
    const back = fromWorld(toWorld(SANGLI.lat, SANGLI.lng));
    expect(back.lat).toBeCloseTo(SANGLI.lat, 9);
    expect(back.lng).toBeCloseTo(SANGLI.lng, 9);
  });
});

describe('fitCamera', () => {
  const box = { north: 16.9, south: 16.8, east: 74.65, west: 74.5 };

  it('centres the box with no panes', () => {
    const camera = fitCamera(box, SIZE, NONE, LIMITS);
    expect(camera.lng).toBeCloseTo(74.575, 6);
    expect(camera.lat).toBeCloseTo(16.85, 2);
  });

  it('fills the narrow side exactly', () => {
    const camera = fitCamera(box, SIZE, NONE, LIMITS);
    const nw = toWorld(box.north, box.west);
    const se = toWorld(box.south, box.east);
    const scale = 256 * 2 ** camera.zoom;
    const width = (se.x - nw.x) * scale;
    const height = (se.y - nw.y) * scale;
    expect(Math.max(width / SIZE.width, height / SIZE.height)).toBeCloseTo(1, 6);
  });

  it('moves the centre away from a pane, so the box sits in the clear part', () => {
    const right = fitCamera(box, SIZE, { ...NONE, right: 400 }, LIMITS);
    expect(right.lng).toBeGreaterThan(74.575);
  });

  it('keeps within the zoom limits', () => {
    const tiny = { north: 16.85001, south: 16.85, east: 74.58001, west: 74.58 };
    expect(fitCamera(tiny, SIZE, NONE, LIMITS).zoom).toBe(20);
  });
});

describe('cameraAt', () => {
  const from = { ...SANGLI, zoom: 12 };

  it('starts and ends exactly on the two cameras', () => {
    const to = { lat: 16.9, lng: 74.7, zoom: 15 };
    expect(cameraAt(from, to, 0).lat).toBeCloseTo(from.lat, 9);
    const end = cameraAt(from, to, 1);
    expect(end.lat).toBeCloseTo(to.lat, 9);
    expect(end.lng).toBeCloseTo(to.lng, 9);
    expect(end.zoom).toBe(15);
  });

  it('keeps the centre still for a zoom in place', () => {
    const mid = cameraAt(from, { ...SANGLI, zoom: 13 }, 0.5);
    expect(mid.lat).toBeCloseTo(SANGLI.lat, 9);
    expect(mid.lng).toBeCloseTo(SANGLI.lng, 9);
    expect(mid.zoom).toBe(12.5);
  });

  it('pans in a straight line when the zoom stays', () => {
    const mid = cameraAt(from, { lat: 16.85, lng: 74.6, zoom: 12 }, 0.5);
    expect(mid.lng).toBeCloseTo(74.59, 9);
  });
});

describe('screensApart and stepZoom', () => {
  it('measures a pan in screen widths', () => {
    const to = { lat: SANGLI.lat, lng: SANGLI.lng + 360 / 256 / 2 ** 12, zoom: 12 };
    expect(screensApart({ ...SANGLI, zoom: 12 }, to, { width: 1, height: 1 })).toBeCloseTo(1, 6);
  });

  it('steps to the next whole level', () => {
    expect(stepZoom(13.4, 1)).toBe(14);
    expect(stepZoom(13.4, -1)).toBe(13);
    expect(stepZoom(13, 1)).toBe(14);
    expect(stepZoom(13, -1)).toBe(12);
    expect(stepZoom(12.98, 1)).toBe(13 + 1);
  });
});

describe('zoomAround', () => {
  it('keeps the clicked point at the same place on the screen', () => {
    const from = { ...SANGLI, zoom: 12 };
    const point = { lat: 16.87, lng: 74.62 };
    const to = zoomAround(from, point, 13);
    const offset = (camera: typeof from) => {
      const c = toWorld(camera.lat, camera.lng);
      const p = toWorld(point.lat, point.lng);
      const scale = 256 * 2 ** camera.zoom;
      return { x: (p.x - c.x) * scale, y: (p.y - c.y) * scale };
    };
    expect(offset(to).x).toBeCloseTo(offset(from).x, 6);
    expect(offset(to).y).toBeCloseTo(offset(from).y, 6);
  });
});
