import {
  type Camera,
  cameraAt,
  easeInOut,
  easeOut,
  screensApart,
  stepZoom,
  zoomAround,
} from './camera-math';

/**
 * Smooth camera moves on a vector map, frame by frame with `moveCamera` (Google's own
 * setZoom, fitBounds and panTo jump there at once on a vector map). One motion per map, so
 * the zoom buttons, Fit all and an alert focus never fight: a new move starts from where the
 * last one is now, and a zoom click during a zoom adds to where that zoom is going. The person
 * always wins: a drag, a wheel, a pinch or a press on the map stops the move where it is.
 */
export class CameraMotion {
  private frame = 0;
  private goal: Camera | null = null;
  private readonly stopOnTouch: (event: Event) => void;

  private constructor(private readonly map: google.maps.Map) {
    // Only a touch on the map itself: our buttons over the map queue their zoom instead.
    this.stopOnTouch = (event: Event) => {
      if (event.target instanceof Element && event.target.closest('.gm-style')) this.stop();
    };
    const div = map.getDiv();
    for (const type of ['wheel', 'pointerdown', 'touchstart'] as const)
      div.addEventListener(type, this.stopOnTouch, { passive: true, capture: true });
  }

  private static readonly byMap = new WeakMap<google.maps.Map, CameraMotion>();

  static of(map: google.maps.Map): CameraMotion {
    let motion = CameraMotion.byMap.get(map);
    if (!motion) {
      motion = new CameraMotion(map);
      CameraMotion.byMap.set(map, motion);
    }
    return motion;
  }

  /** Where the camera is going, or where it is when still. */
  target(): Camera | null {
    return this.goal ?? this.now();
  }

  now(): Camera | null {
    const centre = this.map.getCenter();
    const zoom = this.map.getZoom();
    if (!centre || zoom === undefined) return null;
    return { lat: centre.lat(), lng: centre.lng(), zoom };
  }

  /** A zoom step: quick, answering the click at once. */
  zoomTo(zoom: number) {
    const from = this.now();
    const goal = this.goal ?? from;
    if (!from || !goal) return;
    this.run(from, { ...goal, zoom: this.clamp(zoom) }, 260, easeOut);
  }

  /** A double click: one step closer (further with Shift), the clicked point staying put. */
  zoomAt(point: { lat: number; lng: number }, step: number) {
    const from = this.now();
    const goal = this.goal ?? from;
    if (!from || !goal) return;
    const zoom = this.clamp(stepZoom(goal.zoom, step));
    this.run(from, zoomAround(goal, point, zoom), 300, easeOut);
  }

  /** A move the screen asks for (fit, focus, reveal). Far moves take a little longer. */
  flyTo(to: Camera) {
    const from = this.now();
    if (!from) return;
    const goal = { ...to, zoom: this.clamp(to.zoom) };
    const div = this.map.getDiv();
    const apart = screensApart(from, goal, { width: div.clientWidth, height: div.clientHeight });
    // Many screens away at the same zoom there is nothing to watch on the way: go there.
    if (apart > 6 && Math.abs(goal.zoom - from.zoom) < 1) {
      this.stop();
      this.map.moveCamera({ center: goal, zoom: goal.zoom });
      return;
    }
    const ms = Math.min(900, 380 + 90 * Math.abs(goal.zoom - from.zoom) + 40 * Math.min(apart, 5));
    this.run(from, goal, ms, easeInOut);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.goal = null;
  }

  private run(from: Camera, to: Camera, ms: number, ease: (t: number) => number) {
    cancelAnimationFrame(this.frame);
    this.goal = to;
    const start = performance.now();
    const step = (time: number) => {
      const t = Math.min(1, (time - start) / ms);
      const camera = t >= 1 ? to : cameraAt(from, to, ease(t));
      this.map.moveCamera({ center: { lat: camera.lat, lng: camera.lng }, zoom: camera.zoom });
      if (t < 1) this.frame = requestAnimationFrame(step);
      else {
        this.frame = 0;
        this.goal = null;
      }
    };
    this.frame = requestAnimationFrame(step);
  }

  private clamp(zoom: number): number {
    const min = (this.map.get('minZoom') as number | undefined) ?? 0;
    const max = (this.map.get('maxZoom') as number | undefined) ?? 22;
    return Math.max(min, Math.min(max, zoom));
  }
}
