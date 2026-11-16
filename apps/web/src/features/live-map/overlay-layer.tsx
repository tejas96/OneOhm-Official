'use client';

import { useMap } from '@vis.gl/react-google-maps';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Our own HTML and SVG on the map without a Map ID (an AdvancedMarker needs one): a single
 * OverlayView with two layers, shapes under (tails, office circles) and pins over (clickable).
 * Pixels are worked out on each draw (zoom); while the map pans the layers move with it.
 */
export interface Projection {
  /** Pixel position inside the layers for a place. */
  readonly toPixel: (latitude: number, longitude: number) => { x: number; y: number };
  readonly zoom: number;
}

const ProjectionContext = createContext<Projection | null>(null);

export function useProjection(): Projection {
  const projection = useContext(ProjectionContext);
  if (!projection) throw new Error('useProjection outside OverlayLayer.');
  return projection;
}

interface Layers {
  readonly shapes: HTMLDivElement;
  readonly pins: HTMLDivElement;
  readonly projection: Projection;
}

const layerDiv = (className: string) => {
  const div = document.createElement('div');
  div.className = className;
  div.style.position = 'absolute';
  div.style.left = '0';
  div.style.top = '0';
  return div;
};

/** Pins glide between refreshes, but jump at once when the zoom changes (no slide while zooming). */
function settleInstantly(pins: HTMLDivElement) {
  pins.dataset.instant = '';
  requestAnimationFrame(() => requestAnimationFrame(() => delete pins.dataset.instant));
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
    let lastZoom: number | null = null;
    class Overlay extends google.maps.OverlayView {
      override onAdd() {
        const panes = this.getPanes();
        panes?.overlayLayer.appendChild(shapesDiv);
        panes?.overlayMouseTarget.appendChild(pinsDiv);
        google.maps.OverlayView.preventMapHitsAndGesturesFrom(pinsDiv);
      }
      override draw() {
        const projection = this.getProjection();
        if (!projection) return;
        const zoom = map?.getZoom() ?? 0;
        if (lastZoom !== null && lastZoom !== zoom) settleInstantly(pinsDiv);
        lastZoom = zoom;
        setLayers({
          shapes: shapesDiv,
          pins: pinsDiv,
          projection: {
            zoom,
            toPixel: (latitude, longitude) => {
              const point = projection.fromLatLngToDivPixel(
                new google.maps.LatLng(latitude, longitude),
              );
              return { x: point?.x ?? 0, y: point?.y ?? 0 };
            },
          },
        });
      }
      override onRemove() {
        shapesDiv.remove();
        pinsDiv.remove();
      }
    }
    const overlay = new Overlay();
    overlay.setMap(map);
    return () => overlay.setMap(null);
  }, [map]);
  if (!layers) return null;
  return (
    <ProjectionContext.Provider value={layers.projection}>
      {createPortal(shapes, layers.shapes)}
      {createPortal(pins, layers.pins)}
    </ProjectionContext.Provider>
  );
}
