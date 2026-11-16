'use client';

import { useMap } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useRef } from 'react';

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
export function fitBox(
  points: readonly LatLng[],
): { north: number; south: number; east: number; west: number } | null {
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

/** Moves the camera: fit a set of places, focus one, zoom a step. Every move is Google's own. */
export function useCamera(padding: google.maps.Padding) {
  const map = useMap();
  const fit = useCallback(
    (points: readonly LatLng[]) => {
      const box = fitBox(points);
      if (map && box) map.fitBounds(box, padding);
    },
    [map, padding],
  );
  const focus = useCallback(
    (point: LatLng) => {
      if (!map) return;
      if ((map.getZoom() ?? 0) >= FOCUS_ZOOM - 1) {
        map.panTo(point);
        return;
      }
      const box = fitBox([point]);
      if (box) map.fitBounds(box, padding);
    },
    [map, padding],
  );
  const zoomBy = useCallback(
    (step: number) => {
      if (map) map.setZoom(Math.round(map.getZoom() ?? 12) + step);
    },
    [map],
  );
  return { fit, focus, zoomBy, ready: Boolean(map) };
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

/** + and − zoom the map from anywhere on the page (not while typing), as on Google Maps. */
export function useZoomKeys(zoomBy: (step: number) => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      // The map handles its own keys when it has focus.
      if (event.target instanceof HTMLElement && event.target.closest('.gm-style')) return;
      if (event.key === '+' || event.key === '=') zoomBy(1);
      else if (event.key === '-' || event.key === '_') zoomBy(-1);
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomBy]);
}
