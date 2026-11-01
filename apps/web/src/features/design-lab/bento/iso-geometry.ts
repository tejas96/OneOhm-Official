/**
 * Isometric projection for the rooftop illustration. World units: x along the
 * house's right side, y along its left side, z up. Screen y grows with x + y, so
 * the +x and +y faces are the ones facing the viewer.
 */
type Point3 = readonly [number, number, number];

const COS = Math.cos(Math.PI / 6);
const SIN = Math.sin(Math.PI / 6);
const SCALE = 26;
const ORIGIN_X = 156;
const ORIGIN_Y = 132;

export function project([x, y, z]: Point3): [number, number] {
  return [ORIGIN_X + (x - y) * COS * SCALE, ORIGIN_Y + (x + y) * SIN * SCALE - z * SCALE];
}

/** SVG `points` for a polygon through world points. */
export function polygon(points: readonly Point3[]): string {
  return points
    .map((point) =>
      project(point)
        .map((value) => value.toFixed(1))
        .join(','),
    )
    .join(' ');
}

/** SVG path through world points (open polyline). */
export function polyline(points: readonly Point3[]): string {
  return points
    .map((point, index) => {
      const [sx, sy] = project(point);
      return `${index === 0 ? 'M' : 'L'}${sx.toFixed(1)} ${sy.toFixed(1)}`;
    })
    .join(' ');
}

/** A rectangle on the +y face (y fixed): x from x1 to x2, z from z1 to z2. */
export function onLeftFace(y: number, x1: number, x2: number, z1: number, z2: number): string {
  return polygon([
    [x1, y, z1],
    [x2, y, z1],
    [x2, y, z2],
    [x1, y, z2],
  ]);
}

/** A rectangle on the +x face (x fixed): y from y1 to y2, z from z1 to z2. */
export function onRightFace(x: number, y1: number, y2: number, z1: number, z2: number): string {
  return polygon([
    [x, y1, z1],
    [x, y2, z1],
    [x, y2, z2],
    [x, y1, z2],
  ]);
}

export interface Module {
  readonly key: string;
  readonly face: string;
  readonly cells: string;
}

/** One table of modules on the roof, tilted towards the viewer's left (+y). */
export function moduleTable(y0: number, roof: number): readonly Module[] {
  const depth = 1.35;
  const low = roof + 0.45;
  const high = roof + 1.05;
  const width = 1.1;
  return Array.from({ length: 4 }, (_, index) => {
    const x1 = 0.75 + index * (width + 0.06);
    const x2 = x1 + width;
    const at = (x: number, t: number): Point3 => [x, y0 + depth * (1 - t), low + (high - low) * t];
    const cells = [
      polyline([at(x1 + width / 2, 0), at(x1 + width / 2, 1)]),
      ...[0.25, 0.5, 0.75].map((t) => polyline([at(x1, t), at(x2, t)])),
    ].join(' ');
    return {
      key: `${y0}-${index}`,
      face: polygon([at(x1, 0), at(x2, 0), at(x2, 1), at(x1, 1)]),
      cells,
    };
  });
}
