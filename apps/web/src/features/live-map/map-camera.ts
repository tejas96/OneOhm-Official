'use client';

import { useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useRef } from 'react';
import { type Box, fitCamera, stepZoom } from './camera-math';
import { CameraMotion } from './camera-motion';

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/**
 * Fit all never comes closer than a street, even for one person: the box is grown to at
 * least this many degrees each way (about 900 m), so Google's own fit lands there in one move
 * instead of fitting tight and zooming back out.
 */
const MIN_HALF_SPAN = 0.008;
/** Focus on one place (an alert, a list pick): close enough to see the street. */
export const FOCUS_ZOOM = 15;

/** The box to fit, grown to the minimum size around its centre; null when there is nothing. */
export function fitBox(points: readonly LatLng[]): Box | null {
  if (points.length === 0) return null;
  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;
  for (const { lat, lng } of points) {
    north = Math.max(north, lat);
    south = Math.min(south, lat);
    east = Math.max(east, lng);
    west = Math.min(west, lng);
  }
  const lat = (north + south) / 2;
  const lng = (east + west) / 2;
  const halfLat = Math.max(MIN_HALF_SPAN, (north - south) / 2);
  const halfLng = Math.max(MIN_HALF_SPAN, (east - west) / 2);
  return { north: lat + halfLat, south: lat - halfLat, east: lng + halfLng, west: lng - halfLng };
}

/**
 * Moves the camera: fit a set of places, focus one, reveal one, zoom a step. On a vector map
 * every move is a smooth `CameraMotion` (Google's own jump there at once); on a raster map
 * Google's own moves animate, in whole zoom steps.
 */
export function useCamera(padding: google.maps.Padding) {
  const map = useMap();
  const fit = useCallback(
    (points: readonly LatLng[]) => {
      const box = fitBox(points);
      if (!map || !box) return;
      if (isVector(map)) CameraMotion.of(map).flyTo(cameraFor(map, box, padding));
      else map.fitBounds(box, padding);
    },
    [map, padding],
  );
  const focus = useCallback(
    (point: LatLng) => {
      if (!map) return;
      const close = (map.getZoom() ?? 0) >= FOCUS_ZOOM - 1;
      const box = fitBox([point]);
      if (!isVector(map)) {
        if (close) map.panTo(point);
        else if (box) map.fitBounds(box, padding);
        return;
      }
      const motion = CameraMotion.of(map);
      if (close) motion.flyTo({ ...point, zoom: map.getZoom() ?? FOCUS_ZOOM });
      else if (box) motion.flyTo(cameraFor(map, box, padding));
    },
    [map, padding],
  );
  /** Brings a place into view only when it is off screen; the zoom stays. */
  const reveal = useCallback(
    (point: LatLng) => {
      if (!map || map.getBounds()?.contains(point)) return;
      if (isVector(map)) CameraMotion.of(map).flyTo({ ...point, zoom: map.getZoom() ?? 12 });
      else map.panTo(point);
    },
    [map],
  );
  const zoomBy = useCallback(
    (step: number) => {
      if (!map) return;
      if (isVector(map)) {
        const motion = CameraMotion.of(map);
        motion.zoomTo(stepZoom(motion.target()?.zoom ?? map.getZoom() ?? 12, step));
      } else map.setZoom(Math.round(map.getZoom() ?? 12) + step);
    },
    [map],
  );
  return { fit, focus, reveal, zoomBy, ready: Boolean(map) };
}

/** A vector map: fractional zoom, and moves we animate ourselves. */
export const isVector = (map: google.maps.Map) =>
  map.getRenderingType() === google.maps.RenderingType.VECTOR;

function cameraFor(map: google.maps.Map, box: Box, padding: google.maps.Padding) {
  const div = map.getDiv();
  return fitCamera(
    box,
    { width: div.clientWidth, height: div.clientHeight },
    {
      top: padding.top ?? 0,
      right: padding.right ?? 0,
      bottom: padding.bottom ?? 0,
      left: padding.left ?? 0,
    },
    // Never closer than a street on a fit, as on the raster map.
    { min: (map.get('minZoom') as number | undefined) ?? 0, max: FOCUS_ZOOM + 1 },
  );
}

/** Whether the person has moved the map themself (drag, wheel, pinch, keys), since mount. */
export function useUserMoved(): React.RefObject<boolean> {
  const map = useMap();
  const moved = useRef(false);
  useEffect(() => {
    if (!map) return;
    const mark = () => {
      moved.current = true;
    };
    const drag = map.addListener('dragstart', mark);
    const div = map.getDiv();
    div.addEventListener('wheel', mark, { passive: true });
    div.addEventListener('touchstart', mark, { passive: true });
    return () => {
      drag.remove();
      div.removeEventListener('wheel', mark);
      div.removeEventListener('touchstart', mark);
    };
  }, [map]);
  return moved;
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

/**
 * + and − zoom the map from anywhere on the page (not while typing), as on Google Maps. On a
 * raster map Google handles them itself while the map has focus; on a vector map Google's own
 * key zoom jumps, so ours runs first (capture) and takes them over, smooth like the buttons.
 */
const KEY_STEPS: Readonly<Record<string, number>> = { '+': 1, '=': 1, '-': -1, _: -1 };

export function useZoomKeys(zoomBy: (step: number) => void) {
  const map = useMap();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      const onMap = event.target instanceof HTMLElement && event.target.closest('.gm-style');
      if (onMap && !(map && isVector(map))) return;
      const step = KEY_STEPS[event.key];
      if (!step) return;
      zoomBy(step);
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [zoomBy, map]);
}
