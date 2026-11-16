/**
 * Which pin captions fit on screen without covering each other. Greedy: the most important
 * pin keeps its caption, a caption that would overlap one already placed is hidden.
 */
export interface LabelBox {
  readonly id: string;
  /** The pin's anchor in screen pixels; the caption sits centred under it. */
  readonly x: number;
  readonly y: number;
  readonly text: string;
  /** Higher wins: selected, then moving, then the rest. */
  readonly priority: number;
}

/** Caption size in px (12 px Geist, 8 px padding each side), from the pin's anchor. */
const CHAR_PX = 6.6;
const PAD_PX = 16;
const HEIGHT_PX = 22;
const OFFSET_Y = 26;
const GAP_PX = 4;

export interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function captionRect(box: Pick<LabelBox, 'x' | 'y' | 'text'>): Rect {
  const width = box.text.length * CHAR_PX + PAD_PX;
  const top = box.y + OFFSET_Y;
  return { left: box.x - width / 2, right: box.x + width / 2, top, bottom: top + HEIGHT_PX };
}

const overlaps = (a: Rect, b: Rect) =>
  a.left < b.right + GAP_PX &&
  b.left < a.right + GAP_PX &&
  a.top < b.bottom + GAP_PX &&
  b.top < a.bottom + GAP_PX;

/** A pin on screen that no caption may cover: its anchor and the radius it takes. */
export interface PinObstacle {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** A worker's disc with its ring and glyph; a site's house. */
export const WORKER_RADIUS = 26;
export const SITE_RADIUS = 16;

const coversPin = (rect: Rect, pin: PinObstacle) =>
  rect.left < pin.x + pin.radius &&
  pin.x - pin.radius < rect.right &&
  rect.top < pin.y + pin.radius &&
  pin.y - pin.radius < rect.bottom;

/**
 * The captions to show: the most important pin keeps its caption; a caption that would cover
 * another caption, any pin other than its own, or something over the map (the map buttons,
 * the numbers bar: `blocked`) is hidden, never drawn under it.
 */
export function visibleCaptions(
  boxes: readonly LabelBox[],
  pins: readonly PinObstacle[] = [],
  blocked: readonly Rect[] = [],
): Set<string> {
  const placed: Rect[] = [];
  const shown = new Set<string>();
  const ordered = [...boxes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const box of ordered) {
    const rect = captionRect(box);
    if (placed.some((other) => overlaps(rect, other))) continue;
    if (pins.some((pin) => pin.id !== box.id && coversPin(rect, pin))) continue;
    if (blocked.some((other) => overlaps(rect, other))) continue;
    placed.push(rect);
    shown.add(box.id);
  }
  return shown;
}

/** Pins closer than this (px) would cover each other (a 40 px disc and its ring). */
const SAME_SPOT_PX = 44;
/** Room each pin takes on the ring (a 40 px disc plus a gap). */
const RING_STEP_PX = 46;

export interface PinSpot {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

/** Where a pin sits relative to its group's centre: the members, and its offset on the ring. */
export interface RingSpot {
  /** Everyone at this spot, this pin included; one id for a pin on its own. */
  readonly members: readonly string[];
  readonly dx: number;
  readonly dy: number;
}

/**
 * Pins that would sit on top of each other at this zoom (several people at the office) are
 * spread on a small ring around their shared spot, so each stays visible and clickable. Pins
 * on their own keep their place (offset 0). The ring is in screen pixels around the group's
 * centre, so while the map zooms the ring keeps its size and only its centre moves.
 */
export function fanRing(pins: readonly PinSpot[]): Map<string, RingSpot> {
  const groups: PinSpot[][] = [];
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    const near = groups.find((group) =>
      group.some((other) => Math.hypot(other.x - pin.x, other.y - pin.y) < SAME_SPOT_PX),
    );
    if (near) near.push(pin);
    else groups.push([pin]);
  }
  const spots = new Map<string, RingSpot>();
  for (const group of groups) {
    const members = group.map((pin) => pin.id);
    if (group.length === 1) {
      spots.set(members[0] ?? '', { members, dx: 0, dy: 0 });
      continue;
    }
    const radius = Math.max(26, (group.length * RING_STEP_PX) / (2 * Math.PI));
    group.forEach((pin, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
      spots.set(pin.id, { members, dx: radius * Math.cos(angle), dy: radius * Math.sin(angle) });
    });
  }
  return spots;
}

/** The drawn place of every pin by id: its group's centre plus its ring offset. */
export function fanOut(pins: readonly PinSpot[]): Map<string, { x: number; y: number }> {
  const byId = new Map(pins.map((pin) => [pin.id, pin]));
  const placed = new Map<string, { x: number; y: number }>();
  for (const [id, spot] of fanRing(pins)) {
    const group = spot.members.flatMap((member) => byId.get(member) ?? []);
    const cx = group.reduce((sum, pin) => sum + pin.x, 0) / group.length;
    const cy = group.reduce((sum, pin) => sum + pin.y, 0) / group.length;
    placed.set(id, { x: cx + spot.dx, y: cy + spot.dy });
  }
  return placed;
}
