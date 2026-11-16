/**
 * Camera math for smooth moves on a vector map (where Google's own setZoom, fitBounds and
 * panTo jump with no animation). Pure functions, in Web Mercator "world" units: the whole
 * world is 1 × 1 at zoom 0 and 2^zoom tiles of 256 px wide at any zoom.
 */

export interface Camera {
  readonly lat: number;
  readonly lng: number;
  readonly zoom: number;
}

export interface Box {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const TILE = 256;
const MAX_LAT = 85.05112878;

interface World {
  readonly x: number;
  readonly y: number;
}

export function toWorld(lat: number, lng: number): World {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function fromWorld({ x, y }: World): { lat: number; lng: number } {
  const n = Math.PI - 2 * Math.PI * y;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(n)),
    lng: x * 360 - 180,
  };
}

/**
 * The camera that shows the box in the part of the map the panes leave clear, as
 * `fitBounds(box, padding)` would, but with a fractional zoom (a vector map allows it).
 */
export function fitCamera(
  box: Box,
  size: Size,
  padding: Padding,
  limits: { readonly min: number; readonly max: number },
): Camera {
  const nw = toWorld(box.north, box.west);
  const se = toWorld(box.south, box.east);
  const spanX = Math.max(se.x - nw.x, 1e-9);
  const spanY = Math.max(se.y - nw.y, 1e-9);
  const clearWidth = Math.max(size.width - padding.left - padding.right, 40);
  const clearHeight = Math.max(size.height - padding.top - padding.bottom, 40);
  const fitted = Math.log2(Math.min(clearWidth / (spanX * TILE), clearHeight / (spanY * TILE)));
  const zoom = Math.max(limits.min, Math.min(limits.max, fitted));
  const scale = TILE * 2 ** zoom;
  // The box centre lands in the middle of the clear part, not of the whole map.
  const centre = {
    x: (nw.x + se.x) / 2 - (padding.left - padding.right) / 2 / scale,
    y: (nw.y + se.y) / 2 - (padding.top - padding.bottom) / 2 / scale,
  };
  return { ...fromWorld(centre), zoom };
}

/**
 * The camera part way (`t` from 0 to 1) from one camera to another. Zoom changes evenly, and
 * the centre moves so that one point on the map stays still on the screen (the point both
 * views share), as a pinch does: nothing swings out of view and back.
 */
export function cameraAt(from: Camera, to: Camera, t: number): Camera {
  const zoom = from.zoom + (to.zoom - from.zoom) * t;
  const a = toWorld(from.lat, from.lng);
  const b = toWorld(to.lat, to.lng);
  const s = 2 ** (to.zoom - from.zoom);
  if (Math.abs(s - 1) < 1e-3) {
    return { ...fromWorld({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }), zoom };
  }
  // The fixed point P: (P - a) on screen at the start equals (P - b) · s at the end.
  const p = { x: (s * b.x - a.x) / (s - 1), y: (s * b.y - a.y) / (s - 1) };
  const k = 2 ** -(zoom - from.zoom);
  return { ...fromWorld({ x: p.x + (a.x - p.x) * k, y: p.y + (a.y - p.y) * k }), zoom };
}

/** The camera after zooming to `zoom` with `point` kept still on the screen (a double click). */
export function zoomAround(
  from: Camera,
  point: { lat: number; lng: number },
  zoom: number,
): Camera {
  const c = toWorld(from.lat, from.lng);
  const p = toWorld(point.lat, point.lng);
  const k = 2 ** -(zoom - from.zoom);
  return { ...fromWorld({ x: p.x + (c.x - p.x) * k, y: p.y + (c.y - p.y) * k }), zoom };
}

/** How far apart two cameras are, in screen widths at the closer zoom. */
export function screensApart(from: Camera, to: Camera, size: Size): number {
  const a = toWorld(from.lat, from.lng);
  const b = toWorld(to.lat, to.lng);
  const scale = TILE * 2 ** Math.max(from.zoom, to.zoom);
  return (Math.hypot(b.x - a.x, b.y - a.y) * scale) / Math.max(size.width, 1);
}

/** A zoom step from the buttons or keys: to the next whole level, as Google Maps does. */
export function stepZoom(zoom: number, step: number): number {
  return step > 0 ? Math.floor(zoom + 0.05) + step : Math.ceil(zoom - 0.05) + step;
}

/** Calm, then fast, then calm: for moves the screen asks for (fit, focus). */
export const easeInOut = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** Fast start, soft landing: for zoom steps, which answer a click at once. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;
