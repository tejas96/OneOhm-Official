import type { RingSpot } from './label-layout';

/**
 * The arithmetic of pins that move on their own: a glide between two places when a refresh
 * brings a new position, and a short tween when pins spread out or come together after a zoom.
 * Places are interpolated in latitude and longitude, never in screen pixels, so a pin that is
 * gliding while the map zooms or pans stays on the map.
 */
export interface Geo {
  readonly lat: number;
  readonly lng: number;
}

export interface Glide {
  readonly from: Geo;
  readonly to: Geo;
  /** `performance.now()` when it began, in ms. */
  readonly start: number;
  readonly ms: number;
}

/** A refresh glide: long enough to read as travel, short of the next refresh. */
export const GLIDE_MS = 1200;
/** Pins spreading on a ring, or closing it, after the map settles. */
export const SPREAD_MS = 220;
/** A jump longer than this (a gap, a fake point) is shown at once, not as a slide. */
export const MAX_GLIDE_KM = 5;

/** Ease out: quick start, gentle arrival (the token `--ease-out-expo` in spirit). */
export const easeOut = (t: number) => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;

/** How far through a timed move we are at `now`, 0 to 1. */
export const progress = (start: number, ms: number, now: number) =>
  ms <= 0 ? 1 : Math.min(1, Math.max(0, (now - start) / ms));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Straight-line km between two places (good enough to decide glide or jump). */
export function kmBetween(a: Geo, b: Geo): number {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * 6371;
}

/** Where a glide is at `now`, and whether it has arrived. */
export function glideAt(glide: Glide, now: number): { readonly at: Geo; readonly done: boolean } {
  const t = progress(glide.start, glide.ms, now);
  const k = easeOut(t);
  return {
    at: { lat: lerp(glide.from.lat, glide.to.lat, k), lng: lerp(glide.from.lng, glide.to.lng, k) },
    done: t >= 1,
  };
}

/**
 * The glide for a new position: from where the pin is drawn now to the new place, or none
 * (show it there at once) when it is the first position, unchanged, too far, or motion is off.
 */
export function nextGlide(
  shown: Geo | null,
  target: Geo,
  now: number,
  calm: boolean,
): Glide | null {
  if (!shown || calm) return null;
  if (shown.lat === target.lat && shown.lng === target.lng) return null;
  if (kmBetween(shown, target) > MAX_GLIDE_KM) return null;
  return { from: shown, to: target, start: now, ms: GLIDE_MS };
}

/** Motion is calm: the app setting or the device asks for less. */
export const calmMotion = () =>
  typeof window !== 'undefined' &&
  (document.documentElement.dataset.motion === 'calm' ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** Same group and same place on its ring. */
export const sameRing = (a: RingSpot, b: RingSpot) =>
  a.dx === b.dx && a.dy === b.dy && a.members.join() === b.members.join();
