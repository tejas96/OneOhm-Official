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

interface Rect {
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

export function visibleCaptions(boxes: readonly LabelBox[]): Set<string> {
  const placed: Rect[] = [];
  const shown = new Set<string>();
  const ordered = [...boxes].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  for (const box of ordered) {
    const rect = captionRect(box);
    if (placed.some((other) => overlaps(rect, other))) continue;
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

/**
 * Pins that would sit on top of each other at this zoom (several people at the office) are
 * spread on a small ring around their shared spot, so each stays visible and clickable. Pins
 * on their own keep their place. Returns the drawn place of every pin by id.
 */
export function fanOut(pins: readonly PinSpot[]): Map<string, { x: number; y: number }> {
  const groups: PinSpot[][] = [];
  for (const pin of [...pins].sort((a, b) => a.id.localeCompare(b.id))) {
    const near = groups.find((group) =>
      group.some((other) => Math.hypot(other.x - pin.x, other.y - pin.y) < SAME_SPOT_PX),
    );
    if (near) near.push(pin);
    else groups.push([pin]);
  }
  const placed = new Map<string, { x: number; y: number }>();
  for (const group of groups) {
    if (group.length === 1) {
      const [only] = group;
      if (only) placed.set(only.id, { x: only.x, y: only.y });
      continue;
    }
    const cx = group.reduce((sum, pin) => sum + pin.x, 0) / group.length;
    const cy = group.reduce((sum, pin) => sum + pin.y, 0) / group.length;
    const radius = Math.max(26, (group.length * RING_STEP_PX) / (2 * Math.PI));
    group.forEach((pin, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / group.length;
      placed.set(pin.id, { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
    });
  }
  return placed;
}
