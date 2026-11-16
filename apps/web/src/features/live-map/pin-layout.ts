import {
  fanRing,
  type LabelBox,
  type PinObstacle,
  type RingSpot,
  SITE_RADIUS,
  visibleCaptions,
  WORKER_RADIUS,
} from './label-layout';
import {
  calmMotion,
  easeOut,
  type Geo,
  glideAt,
  lerp,
  nextGlide,
  progress,
  SPREAD_MS,
  sameRing,
} from './pin-motion';
import { newPin, type Pin, type PinKind } from './pin-state';

/** The map's projection at the last draw: layer pixels for a place, and the zoom. */
export interface Frame {
  readonly zoom: number;
  readonly toPixel: (latitude: number, longitude: number) => { x: number; y: number };
}

/** Captions show from this zoom in; further out the pins speak for themselves. */
export const CAPTION_ZOOM = 12;

/**
 * Places every pin on the map, outside React: the overlay calls `setFrame` on each of the
 * map's draws (every zoom step and pan), and the pins are moved there in the same frame by
 * writing their transform. React renders what a pin looks like; this decides only where.
 * Grouping (the fan-out) and which captions fit are worked out once the map settles, so
 * nothing regroups or flickers mid-zoom; a refresh glides a moved worker to its new place.
 */
export type { PinKind };

export class PinLayout {
  private readonly pins = new Map<string, Pin>();
  private readonly refs = new Map<string, (el: HTMLElement | null) => void>();
  private frame: Frame | null = null;
  private loop = 0;

  /** A stable ref callback for a pin's element. */
  ref(id: string, kind: PinKind): (el: HTMLElement | null) => void {
    const key = `${kind}:${id}`;
    let ref = this.refs.get(key);
    if (!ref) {
      ref = (el) => {
        const pin = this.pinOf(key, kind);
        pin.el = el;
        if (!el) {
          this.pins.delete(key);
          this.refs.delete(key);
        } else this.drawPin(pin);
      };
      this.refs.set(key, ref);
    }
    return ref;
  }

  /** Where a pin should be (null hides it), and its caption; call after each render. */
  place(
    id: string,
    kind: PinKind,
    at: Geo | null,
    options: { caption?: string | null; priority?: number; instant?: boolean } = {},
  ) {
    const pin = this.pinOf(`${kind}:${id}`, kind);
    pin.caption = options.caption ?? null;
    pin.priority = options.priority ?? 0;
    const target = pin.target;
    if (at && target && at.lat === target.lat && at.lng === target.lng) return;
    pin.target = at;
    if (!at) {
      pin.shown = null;
      pin.glide = null;
      return;
    }
    const now = performance.now();
    const shown = pin.glide ? glideAt(pin.glide, now).at : pin.shown;
    pin.glide =
      kind === 'worker' && !options.instant ? nextGlide(shown, at, now, calmMotion()) : null;
    if (!pin.glide) pin.shown = at;
    if (pin.glide) this.run();
  }

  /** After React placed every pin: draw them, then regroup and pick captions. */
  commit() {
    this.draw();
    this.settle();
  }

  setFrame(frame: Frame) {
    this.frame = frame;
    this.draw();
  }

  /** Regroups the fan-out and picks the captions for the map as it is now (map idle, new data). */
  settle() {
    const frame = this.frame;
    if (!frame) return;
    // By the person's id (the map's keys carry the kind in front).
    const workers = [...this.pins.entries()]
      .filter(([, pin]) => pin.kind === 'worker' && pin.shown && pin.el)
      .map(([key, pin]) => [key.slice('worker:'.length), pin] as const);
    const spots = fanRing(
      workers.flatMap(([id, pin]) =>
        pin.shown ? [{ id, ...frame.toPixel(pin.shown.lat, pin.shown.lng) }] : [],
      ),
    );
    const now = performance.now();
    const calm = calmMotion();
    for (const [id, pin] of workers) {
      const next = spots.get(id);
      if (!next || sameRing(next, pin.ring)) continue;
      pin.fromRing = calm ? null : pin.ring;
      pin.ring = next;
      pin.ringStart = now;
    }
    this.draw();
    const shown = frame.zoom < CAPTION_ZOOM ? new Set<string>() : this.captions(frame);
    for (const [id, pin] of workers) pin.el?.toggleAttribute('data-caption', shown.has(id));
    if (workers.some(([, pin]) => pin.fromRing)) this.run();
  }

  /** Captions that fit where the pins will rest, clear of other captions and of every pin. */
  private captions(frame: Frame): Set<string> {
    const boxes: LabelBox[] = [];
    const obstacles: PinObstacle[] = [];
    for (const [key, pin] of this.pins) {
      if (!pin.shown || !pin.el) continue;
      const id = key.slice(pin.kind.length + 1);
      const at =
        pin.kind === 'worker'
          ? this.ringPixel(pin.ring, frame, pin.shown)
          : frame.toPixel(pin.shown.lat, pin.shown.lng);
      const radius = pin.kind === 'worker' ? WORKER_RADIUS : SITE_RADIUS;
      obstacles.push({ id: pin.kind === 'worker' ? id : key, ...at, radius });
      if (pin.kind === 'worker' && pin.caption)
        boxes.push({ id, ...at, text: pin.caption, priority: pin.priority });
    }
    return visibleCaptions(boxes, obstacles);
  }

  dispose() {
    cancelAnimationFrame(this.loop);
    this.loop = 0;
  }

  private pinOf(key: string, kind: PinKind): Pin {
    let pin = this.pins.get(key);
    if (!pin) {
      pin = newPin(key.slice(kind.length + 1), kind);
      this.pins.set(key, pin);
    }
    return pin;
  }

  /** The place of a ring's centre: the mean of its members as drawn now. */
  private ringPixel(ring: RingSpot, frame: Frame, own: Geo) {
    let lat = 0;
    let lng = 0;
    let count = 0;
    for (const member of ring.members) {
      const shown = this.pins.get(`worker:${member}`)?.shown;
      if (!shown) continue;
      lat += shown.lat;
      lng += shown.lng;
      count += 1;
    }
    const centre =
      count > 0 ? frame.toPixel(lat / count, lng / count) : frame.toPixel(own.lat, own.lng);
    return { x: centre.x + ring.dx, y: centre.y + ring.dy };
  }

  private pixelOf(pin: Pin, frame: Frame, now: number) {
    if (!pin.shown) return null;
    if (pin.kind !== 'worker') return frame.toPixel(pin.shown.lat, pin.shown.lng);
    const to = this.ringPixel(pin.ring, frame, pin.shown);
    if (!pin.fromRing) return to;
    const t = progress(pin.ringStart, SPREAD_MS, now);
    if (t >= 1) {
      pin.fromRing = null;
      return to;
    }
    const from = this.ringPixel(pin.fromRing, frame, pin.shown);
    const k = easeOut(t);
    return { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
  }

  private drawPin(pin: Pin, now = performance.now()) {
    const frame = this.frame;
    if (!pin.el || !frame) return;
    if (pin.glide) {
      const step = glideAt(pin.glide, now);
      pin.shown = step.at;
      if (step.done) pin.glide = null;
    }
    const at = this.pixelOf(pin, frame, now);
    if (!at) {
      pin.el.style.visibility = 'hidden';
      return;
    }
    pin.el.style.visibility = 'visible';
    pin.el.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`;
  }

  private draw() {
    const now = performance.now();
    for (const pin of this.pins.values()) this.drawPin(pin, now);
  }

  /** Runs frames while something glides or spreads; settles once the last glide arrives. */
  private run() {
    if (this.loop) return;
    const tick = () => {
      this.loop = 0;
      const gliding = [...this.pins.values()].some((pin) => pin.glide);
      this.draw();
      const moving = [...this.pins.values()].some((pin) => pin.glide || pin.fromRing);
      if (moving) this.loop = requestAnimationFrame(tick);
      else if (gliding) this.settle();
    };
    this.loop = requestAnimationFrame(tick);
  }
}
