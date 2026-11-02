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

/**
 * `gps` saves the check-in reading (today's path); `gpsPin` sends the fresh reading as a
 * pin, for a visit checked in without a fix (the server saves it flagged, no distance).
 */
export type SheetAction = 'confirm' | 'gps' | 'gpsPin' | 'close';
type SheetButton = { readonly label: string; readonly action: SheetAction };

export interface SheetFacts {
  /** The site already has a point. */
  readonly hasSaved: boolean;
  /** The open visit has a check-in point that may become the site's location. */
  readonly canSetSite: boolean;
  /** The phone has a fresh reading to start the sheet from. */
  readonly hasStart: boolean;
}

/** What "Use my GPS reading" does here, or null when there is no reading to use. */
function gpsAction({ hasSaved, canSetSite, hasStart }: SheetFacts): SheetAction | null {
  if (hasSaved) return null;
  if (canSetSite) return 'gps';
  return hasStart ? 'gpsPin' : null;
}

/**
 * The sheet's buttons. The GPS reading only fills an empty location, so with a saved
 * point it is never offered (the server would refuse it); a failed map then just keeps
 * the saved location. With no reading to use at all, a failed map can only be closed.
 */
export function sheetActions(
  state: MapState,
  facts: SheetFacts,
): { message: string | null; primary: SheetButton; secondary: SheetButton | null } {
  const gps = gpsAction(facts);
  if (state === 'failed') {
    if (facts.hasSaved) {
      return {
        message: PIN.failedSaved,
        primary: { label: PIN.keepSaved, action: 'close' },
        secondary: null,
      };
    }
    return gps
      ? { message: null, primary: { label: PIN.failed, action: gps }, secondary: null }
      : {
          message: PIN.failedSaved,
          primary: { label: PIN.closeShort, action: 'close' },
          secondary: null,
        };
  }
  return {
    message: null,
    primary: { label: PIN.confirm, action: 'confirm' },
    secondary: gps ? { label: PIN.useGps, action: gps } : null,
  };
}
