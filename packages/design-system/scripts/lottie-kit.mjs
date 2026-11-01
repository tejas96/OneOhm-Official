// Tiny helpers for writing Lottie (Bodymovin 5) JSON by hand: shapes, fills, strokes,
// trims and eased keyframes. Used only by write-illustrations.mjs.

/** Cubic-bezier easings as Lottie out/in tangents (from tokens/motion EASING). */
export const EASE = {
  out: [0.22, 1, 0.36, 1],
  standard: [0.2, 0, 0, 1],
  inOut: [0.65, 0, 0.35, 1],
  linear: [0, 0, 1, 1],
};

const round = (value) => Math.round(value * 1000) / 1000;

/** "#3F9A45" → [r, g, b, 1] in 0–1, exact to the 8-bit value. */
export function rgb(hex) {
  const value = hex.replace('#', '');
  const channel = (at) => round(Number.parseInt(value.slice(at, at + 2), 16) / 255);
  return [channel(0), channel(2), channel(4), 1];
}

/** A still value. */
export const still = (k) => ({ a: 0, k });

/**
 * An animated value from [frame, value] pairs; `ease` shapes every step. Values may be
 * numbers or arrays (positions, scales).
 */
export function keys(pairs, ease = EASE.out) {
  const [x1, y1, x2, y2] = ease;
  return {
    a: 1,
    k: pairs.map(([t, value], index) => {
      const s = Array.isArray(value) ? value : [value];
      if (index === pairs.length - 1) return { t, s };
      const dims = s.length;
      return {
        t,
        s,
        o: { x: Array(dims).fill(x1), y: Array(dims).fill(y1) },
        i: { x: Array(dims).fill(x2), y: Array(dims).fill(y2) },
      };
    }),
  };
}

const groupTransform = () => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
});

export const ellipse = (x, y, size) => ({
  ty: 'el',
  d: 1,
  p: still([x, y]),
  s: still([size, size]),
});

export const rect = (x, y, width, height, radius = 0) => ({
  ty: 'rc',
  d: 1,
  p: still([x, y]),
  s: still([width, height]),
  r: still(radius),
});

/** A straight-segment path through the points; `closed` joins the last to the first. */
export function path(points, closed = false) {
  const zero = points.map(() => [0, 0]);
  return { ty: 'sh', d: 1, ks: still({ i: zero, o: zero, v: points, c: closed }) };
}

export const fill = (hex, opacity = 100) => ({
  ty: 'fl',
  c: still(rgb(hex)),
  o: still(opacity),
  r: 1,
});

export const stroke = (hex, width) => ({
  ty: 'st',
  c: still(rgb(hex)),
  o: still(100),
  w: still(width),
  lc: 2,
  lj: 2,
  ml: 4,
});

/** Draws the path from its start: `end` animates 0 → 100. */
export const trim = (end) => ({ ty: 'tm', s: still(0), e: end, o: still(0), m: 1 });

export const group = (name, ...items) => ({ ty: 'gr', nm: name, it: [...items, groupTransform()] });

/**
 * A shape layer centred on its anchor. `transform` may animate o (opacity), r (rotation),
 * p (position [x, y, 0]) and s (scale [x, y, 100]).
 */
export function layer(index, name, shapes, transform, frames) {
  const [x, y] = transform.anchor ?? [0, 0];
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: transform.o ?? still(100),
      r: transform.r ?? still(0),
      p: transform.p ?? still([x, y, 0]),
      a: still([x, y, 0]),
      s: transform.s ?? still([100, 100, 100]),
    },
    ao: 0,
    shapes,
    ip: 0,
    op: frames,
    st: 0,
    bm: 0,
  };
}

/** The whole animation: 120 × 120 at 60 fps; the first layer draws on top. */
export function animation(name, frames, layers) {
  return {
    v: '5.12.0',
    fr: 60,
    ip: 0,
    op: frames,
    w: 120,
    h: 120,
    nm: name,
    ddd: 0,
    assets: [],
    layers: layers.map((make, index) => make(index + 1, frames)),
  };
}

/** Points of a five-pointed star, the first point straight up. */
export function starPoints(cx, cy, outer, inner) {
  return Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    return [round(cx + radius * Math.cos(angle)), round(cy + radius * Math.sin(angle))];
  });
}

/** "41 61, 54 74" → [[41, 61], [54, 74]]: points written the way they are drawn. */
export const pts = (text) => text.split(',').map((pair) => pair.trim().split(/\s+/).map(Number));

/** "22:0 48:100" → a 1-D value moving through those [frame:value] steps. */
export const ramp = (text, ease) =>
  keys(
    text.split(/\s+/).map((step) => step.split(':').map(Number)),
    ease,
  );

/** "0:70 24:100" → a uniform scale (percent) through those steps. */
export const scale = (text, ease) =>
  keys(
    text.split(/\s+/).map((step) => {
      const [t, value] = step.split(':').map(Number);
      return [t, [value, value, 100]];
    }),
    ease,
  );

/** "0:76 26:66" → a move along y at a fixed x. */
export const rise = (x, text, ease) =>
  keys(
    text.split(/\s+/).map((step) => {
      const [t, y] = step.split(':').map(Number);
      return [t, [x, y, 0]];
    }),
    ease,
  );
