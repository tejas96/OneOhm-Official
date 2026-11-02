/** The map in the pin sheet: still loading, showing, or given up on (no signal). */
export type MapState = 'loading' | 'ready' | 'failed';

export type MapEvent =
  | { readonly type: 'mapReady' }
  | { readonly type: 'elapsed'; readonly ms: number };

/** How long the map may take to load before the sheet offers the GPS reading instead. */
export const MAP_GIVE_UP_MS = 8000;

/**
 * Loading turns ready when the map loads, or failed after 8 s. A ready map never fails
 * later; a map that loads after we gave up is still used.
 */
export function nextMapState(state: MapState, event: MapEvent): MapState {
  if (event.type === 'mapReady') return 'ready';
  if (state === 'loading' && event.ms >= MAP_GIVE_UP_MS) return 'failed';
  return state;
}

const METRES_PER_DEGREE = 111_320;

/** A map region centred on the point, about `spanM` metres across (a house and its yard). */
export function regionAround(
  point: { readonly latitude: number; readonly longitude: number },
  spanM: number,
) {
  const latitudeDelta = spanM / METRES_PER_DEGREE;
  const longitudeDelta = latitudeDelta / Math.max(Math.cos((point.latitude * Math.PI) / 180), 0.01);
  return { latitude: point.latitude, longitude: point.longitude, latitudeDelta, longitudeDelta };
}
