import type { RingSpot } from './label-layout';
import type { Geo, Glide } from './pin-motion';

/** Workers fan out and carry captions; sites and markers (the replay dot) stay where they are. */
export type PinKind = 'worker' | 'site' | 'marker';

/** What the layout knows about one pin: its element, where it is going and where it is drawn. */
export interface Pin {
  el: HTMLElement | null;
  readonly kind: PinKind;
  target: Geo | null;
  shown: Geo | null;
  glide: Glide | null;
  ring: RingSpot;
  fromRing: RingSpot | null;
  ringStart: number;
  caption: string | null;
  priority: number;
}

/** A pin not placed yet: on its own, hidden until it has a place. */
export function newPin(id: string, kind: PinKind): Pin {
  return {
    el: null,
    kind,
    target: null,
    shown: null,
    glide: null,
    ring: { members: [id], dx: 0, dy: 0 },
    fromRing: null,
    ringStart: 0,
    caption: null,
    priority: 0,
  };
}
