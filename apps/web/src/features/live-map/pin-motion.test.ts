import { describe, expect, it } from 'vitest';
import { fanRing, visibleCaptions, WORKER_RADIUS } from './label-layout';
import { fitBox } from './map-camera';
import { easeOut, GLIDE_MS, glideAt, kmBetween, nextGlide } from './pin-motion';

describe('pin motion', () => {
  const a = { lat: 16.85, lng: 74.58 };
  const b = { lat: 16.86, lng: 74.58 };

  it('glides a moved worker from where it is drawn to its new place, in map coordinates', () => {
    const glide = nextGlide(a, b, 1000, false);
    expect(glide).toEqual({ from: a, to: b, start: 1000, ms: GLIDE_MS });
    if (!glide) return;
    expect(glideAt(glide, 1000).at).toEqual(a);
    expect(glideAt(glide, 1000 + GLIDE_MS)).toEqual({ at: b, done: true });
    const half = glideAt(glide, 1000 + GLIDE_MS / 2);
    expect(half.done).toBe(false);
    expect(half.at.lat).toBeGreaterThan(16.855);
  });

  it('shows a first place, no move, a long jump or calm motion at once', () => {
    expect(nextGlide(null, b, 0, false)).toBeNull();
    expect(nextGlide(a, a, 0, false)).toBeNull();
    expect(nextGlide(a, { lat: 17.0, lng: 74.58 }, 0, false)).toBeNull();
    expect(nextGlide(a, b, 0, true)).toBeNull();
    expect(kmBetween(a, b)).toBeCloseTo(1.11, 1);
  });

  it('eases out and clamps', () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe('fan-out ring', () => {
  it('keeps a lone pin at its place and rings a crowd around its centre in pixels', () => {
    const spots = fanRing([
      { id: 'a', x: 0, y: 0 },
      { id: 'b', x: 2, y: 1 },
      { id: 'c', x: 500, y: 500 },
    ]);
    expect(spots.get('c')).toEqual({ members: ['c'], dx: 0, dy: 0 });
    expect(spots.get('a')?.members).toEqual(['a', 'b']);
    const ra = spots.get('a');
    const rb = spots.get('b');
    expect(
      Math.hypot((ra?.dx ?? 0) - (rb?.dx ?? 0), (ra?.dy ?? 0) - (rb?.dy ?? 0)),
    ).toBeGreaterThan(40);
  });
});

describe('fit box', () => {
  it('grows a single place to a street-sized box so a fit lands once', () => {
    const box = fitBox([{ lat: 16.85, lng: 74.58 }]);
    expect(box && box.north - box.south).toBeCloseTo(0.016);
    expect(fitBox([])).toBeNull();
    const wide = fitBox([
      { lat: 16, lng: 74 },
      { lat: 17, lng: 75 },
    ]);
    expect(wide).toEqual({ north: 17, south: 16, east: 75, west: 74 });
  });
});

describe('captions clear of pins', () => {
  const box = (id: string, x: number, y: number, priority: number) => ({
    id,
    x,
    y,
    text: 'Ravi · 12.4 km · 64%',
    priority,
  });
  const pin = (id: string, x: number, y: number) => ({ id, x, y, radius: WORKER_RADIUS });

  it('hides a caption that would sit under another pin, but not under its own', () => {
    // b's pin sits just under a's anchor, where a's caption would be drawn.
    const shown = visibleCaptions(
      [box('a', 100, 100, 1), box('b', 400, 400, 1)],
      [pin('a', 100, 100), pin('b', 100, 150), pin('c', 400, 300)],
    );
    expect([...shown]).toEqual(['b']);
  });

  it('keeps the higher priority caption when two collide', () => {
    const shown = visibleCaptions([box('idle', 100, 100, 1), box('alert', 110, 104, 4)], []);
    expect([...shown]).toEqual(['alert']);
  });
});
