import type { DutySiteRecord } from '@oneohm/api-contracts';
import { distanceMeters } from '@oneohm/domain';

/** A site entered but not yet stayed at: the check-in waits for the dwell. */
export interface PendingArrival {
  readonly siteId: string;
  /** When the phone saw the Enter event, ISO. */
  readonly enteredAt: string;
}

/** What the phone remembers per person about the fence, so a wake-up with no screen can decide. */
export interface FenceState {
  readonly pending: readonly PendingArrival[];
  /** Sites where the fence knows a visit is open. */
  readonly open: readonly string[];
  /** Visits already asked "Job not finished, why?". */
  readonly shown: readonly string[];
  /** Ambiguity notices already shown (the sites' ids, sorted, joined). */
  readonly near: readonly string[];
  /** The region set last registered with the phone, so a restart does not register it again. */
  readonly registered: string | null;
}

export const EMPTY_STATE: FenceState = {
  pending: [],
  open: [],
  shown: [],
  near: [],
  registered: null,
};

/** The person must stay this long inside the fence before the check-in is sent. */
export const DWELL_MS = 5 * 60_000;

/** A reading must be this exact to confirm an arrival. */
export const ARRIVAL_ACCURACY_M = 100;

/** A pending arrival older than this is forgotten. */
export const PENDING_MAX_MS = 3 * 3_600_000;

const SHOWN_MAX = 100;
const NEAR_MAX = 50;

const capped = (list: readonly string[], add: string, max: number): string[] =>
  [...list.filter((one) => one !== add), add].slice(-max);

export function parseState(raw: unknown): FenceState {
  const data = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<FenceState>;
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : [];
  const pending = Array.isArray(data.pending)
    ? data.pending.flatMap((one): PendingArrival[] =>
        typeof one?.siteId === 'string' && typeof one.enteredAt === 'string'
          ? [{ siteId: one.siteId, enteredAt: one.enteredAt }]
          : [],
      )
    : [];
  return {
    pending,
    open: strings(data.open),
    shown: strings(data.shown),
    near: strings(data.near),
    registered: typeof data.registered === 'string' ? data.registered : null,
  };
}

/** A new pending arrival, replacing one for the same site. */
export const enterSite = (state: FenceState, siteId: string, enteredAt: string): FenceState => ({
  ...state,
  pending: [...state.pending.filter((one) => one.siteId !== siteId), { siteId, enteredAt }],
});

export const discardPending = (state: FenceState, siteId: string): FenceState => ({
  ...state,
  pending: state.pending.filter((one) => one.siteId !== siteId),
});

export const hasPending = (state: FenceState, siteId: string): boolean =>
  state.pending.some((one) => one.siteId === siteId);

export const dropStalePending = (state: FenceState, now: number): FenceState => ({
  ...state,
  pending: state.pending.filter((one) => now - new Date(one.enteredAt).getTime() <= PENDING_MAX_MS),
});

export const markOpen = (state: FenceState, siteId: string): FenceState => ({
  ...state,
  open: capped(state.open, siteId, 50),
});

export const markClosed = (state: FenceState, siteId: string): FenceState => ({
  ...state,
  open: state.open.filter((one) => one !== siteId),
});

export const markShown = (state: FenceState, visitId: string): FenceState => ({
  ...state,
  shown: capped(state.shown, visitId, SHOWN_MAX),
});
export const wasShown = (state: FenceState, visitId: string): boolean =>
  state.shown.includes(visitId);

export const nearKey = (sites: readonly { readonly id: string }[]): string =>
  sites
    .map((site) => site.id)
    .sort()
    .join('|');
export const markNear = (state: FenceState, key: string): FenceState => ({
  ...state,
  near: capped(state.near, key, NEAR_MAX),
});
export const wasNear = (state: FenceState, key: string): boolean => state.near.includes(key);

export const markRegistered = (state: FenceState, key: string | null): FenceState => ({
  ...state,
  registered: key,
});

export interface ArrivalPoint {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
  readonly mocked: boolean;
  /** The reading's time, ms. */
  readonly at: number;
}

/**
 * The pending arrival this reading confirms, or null: inside that site's fence, exact enough,
 * not a fake location, and at least 5 minutes after the Enter event.
 */
export function dueArrival(
  state: FenceState,
  point: ArrivalPoint,
  sites: readonly DutySiteRecord[],
): { arrival: PendingArrival; site: DutySiteRecord } | null {
  if (point.mocked || point.accuracyM === null || point.accuracyM > ARRIVAL_ACCURACY_M) return null;
  for (const arrival of state.pending) {
    const site = sites.find((one) => one.id === arrival.siteId);
    const entered = new Date(arrival.enteredAt).getTime();
    if (!site || point.at < entered + DWELL_MS) continue;
    if (distanceMeters(point, site) <= site.radiusM) return { arrival, site };
  }
  return null;
}
