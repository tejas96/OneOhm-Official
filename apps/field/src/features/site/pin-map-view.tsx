import type { PinMapViewProps } from './pin-map-view.types';

/**
 * No map off iOS and Android (the web never shows the pin sheet's map, see `mapsOn`).
 * Metro picks `pin-map-view.android.tsx` / `pin-map-view.ios.tsx` on phones.
 */
export function PinMapView(_props: PinMapViewProps) {
  return null;
}
