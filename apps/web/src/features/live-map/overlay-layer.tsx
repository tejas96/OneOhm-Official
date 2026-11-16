'use client';

import { useMap } from '@vis.gl/react-google-maps';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import { createPortal } from 'react-dom';
import type { Rect } from './label-layout';
import { type Frame, PinLayout } from './pin-layout';

/**
 * Our own HTML and SVG on the map without a Map ID (an AdvancedMarker needs one): a single
 * OverlayView with two layers, shapes under (tails, office circles) and pins over (clickable).
 *
 * The map calls `draw` on every frame its projection changes (each zoom step, a pan past the
 * edge). Pins are moved right there, in the same frame as the tiles, by `PinLayout` writing
 * their transforms; React is not involved, so no pin ever lags, slides or re-animates while
 * the map moves. Shapes read the same frame through a store that re-renders them at once.
 */
class FrameStore {
  private frame: Frame | null = null;
  private readonly listeners = new Set<() => void>();
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  readonly get = () => this.frame;
  set(frame: Frame) {
    this.frame = frame;
    for (const listener of this.listeners) listener();
  }
}

interface Layers {
  readonly shapes: HTMLDivElement;
  readonly pins: HTMLDivElement;
  readonly store: FrameStore;
  readonly layout: PinLayout;
}

const LayersContext = createContext<Layers | null>(null);

function useLayers(): Layers {
  const layers = useContext(LayersContext);
  if (!layers) throw new Error('Map layer hooks are used outside OverlayLayer.');
  return layers;
}

/** The projection at the last draw, for shapes (re-renders on every frame of a zoom). */
export function useFrame(): Frame | null {
  const { store } = useLayers();
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

/** The engine that places pins; components give it refs and places. */
export function usePinLayout(): PinLayout {
  return useLayers().layout;
}

const layerDiv = (className: string) => {
  const div = document.createElement('div');
  div.className = className;
  div.style.position = 'absolute';
  div.style.left = '0';
  div.style.top = '0';
  return div;
};

/** Pins take their own clicks (the map would treat them as a click on empty map and close the
 * card), but a drag, a wheel or a double click on a pin still moves and zooms the map, as on
 * Google Maps. A press that turned into a drag is not a click on the pin. */
function keepClicksOnPins(pins: HTMLDivElement) {
  let down: { x: number; y: number } | null = null;
  pins.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });
  pins.addEventListener(
    'click',
    (event) => {
      const moved = down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6;
      if (moved) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    true,
  );
  for (const type of ['click', 'contextmenu'])
    pins.addEventListener(type, (event) => event.stopPropagation());
}

/**
 * The things drawn over the map (marked `data-map-obstacle`: the map buttons, the numbers
 * bar) in the pins layer's pixels, so no caption is placed under them.
 */
function blockedRects(pins: HTMLDivElement): Rect[] {
  const origin = pins.getBoundingClientRect();
  return [...document.querySelectorAll('[data-map-obstacle]')].map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left - origin.left,
      right: rect.right - origin.left,
      top: rect.top - origin.top,
      bottom: rect.bottom - origin.top,
    };
  });
}

export function OverlayLayer({
  shapes,
  pins,
}: {
  readonly shapes: ReactNode;
  readonly pins: ReactNode;
}) {
  const map = useMap();
  const [layers, setLayers] = useState<Layers | null>(null);
  useEffect(() => {
    if (!map) return;
    const shapesDiv = layerDiv('live-shapes');
    const pinsDiv = layerDiv('live-pins');
    keepClicksOnPins(pinsDiv);
    const store = new FrameStore();
    const layout = new PinLayout();
    layout.setBlocked(() => blockedRects(pinsDiv));
    class Overlay extends google.maps.OverlayView {
      override onAdd() {
        const panes = this.getPanes();
        panes?.overlayLayer.appendChild(shapesDiv);
        panes?.overlayMouseTarget.appendChild(pinsDiv);
      }
      override draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const frame: Frame = {
          zoom: map?.getZoom() ?? 0,
          toPixel: (latitude, longitude) => {
            const point = projection.fromLatLngToDivPixel({ lat: latitude, lng: longitude });
            return { x: point?.x ?? 0, y: point?.y ?? 0 };
          },
        };
        layout.setFrame(frame);
        store.set(frame);
      }
      override onRemove() {
        shapesDiv.remove();
        pinsDiv.remove();
      }
    }
    const overlay = new Overlay();
    overlay.setMap(map);
    // Grouping and captions are decided once the map comes to rest.
    const idle = map.addListener('idle', () => layout.settle());
    setLayers({ shapes: shapesDiv, pins: pinsDiv, store, layout });
    return () => {
      idle.remove();
      layout.dispose();
      overlay.setMap(null);
    };
  }, [map]);
  if (!layers) return null;
  return (
    <LayersContext.Provider value={layers}>
      {createPortal(shapes, layers.shapes)}
      {createPortal(pins, layers.pins)}
    </LayersContext.Provider>
  );
}
