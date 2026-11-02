import { PIN } from '../../copy/site';

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

export type SheetAction = 'confirm' | 'gps' | 'close';
type SheetButton = { readonly label: string; readonly action: SheetAction };

/**
 * The sheet's buttons. The GPS reading only fills an empty location, so with a saved
 * point it is never offered (the server would refuse it); a failed map then just keeps
 * the saved location.
 */
export function sheetActions(
  state: MapState,
  hasSaved: boolean,
): { message: string | null; primary: SheetButton; secondary: SheetButton | null } {
  if (state === 'failed') {
    return hasSaved
      ? {
          message: PIN.failedSaved,
          primary: { label: PIN.keepSaved, action: 'close' },
          secondary: null,
        }
      : { message: null, primary: { label: PIN.failed, action: 'gps' }, secondary: null };
  }
  return {
    message: null,
    primary: { label: PIN.confirm, action: 'confirm' },
    secondary: hasSaved ? null : { label: PIN.useGps, action: 'gps' },
  };
}
