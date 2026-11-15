import type { DutySiteRecord, PositionInput } from '@oneohm/api-contracts';
import { ambiguousSitesAt } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api, currentToken, setToken, tokenStore } from '@/api/api';
import { readPrefs } from '../duty/duty-store';
import { announceNear } from './fence-notify';
import { type FenceRegion, regionsFor } from './fence-regions';
import { fenceQueue, flushFences } from './fence-sender';
import {
  discardPending,
  enterSite,
  hasPending,
  markClosed,
  markNear,
  markRegistered,
  nearKey,
  wasNear,
} from './fence-state';
import { readFenceSites, readFenceState, updateFenceState, writeFenceSites } from './fence-store';

/** The name the operating system knows the site fence by. */
export const FENCE_TASK = 'oneohm-site-fence';

/** A fresh reading is waited for this long; then the event goes without a position. */
const QUICK_FIX_MS = 4_000;

/** The server is asked whether a visit is open for this long before the local record is trusted. */
const OPEN_ASK_MS = 4_000;

interface Fix {
  readonly position: PositionInput;
  readonly mocked: boolean;
}

const asFix = (location: Location.LocationObject): Fix => ({
  position: {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyM: location.coords.accuracy,
  },
  mocked: location.mocked === true,
});

/** The phone's location if it comes quickly, else null: the event is never held up for it. */
async function quickPosition(): Promise<Fix | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({
      maxAge: 60_000,
      requiredAccuracy: 100,
    });
    if (last) return asFix(last);
    const fresh = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), QUICK_FIX_MS)),
    ]);
    return fresh ? asFix(fresh) : null;
  } catch {
    return null;
  }
}

/** Whether the server says the person has a visit open at this site; false when it cannot say. */
async function serverSaysOpen(siteId: string): Promise<boolean> {
  try {
    if (!currentToken()) {
      const saved = await tokenStore.read();
      if (saved) setToken(saved);
    }
    const { visit } = await Promise.race([
      unwrap(api.siteActivity.myOpenVisit()),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('slow')), OPEN_ASK_MS)),
    ]);
    return visit?.taskId === siteId || visit?.serviceRequestId === siteId;
  } catch {
    return false;
  }
}

async function onEvent(
  eventType: Location.GeofencingEventType,
  region: Location.LocationRegion,
): Promise<void> {
  const { activeUserId } = await readPrefs();
  if (!activeUserId) {
    await stopFence();
    return;
  }
  const sites = await readFenceSites(activeUserId);
  const site = sites.find((one) => one.id === region.identifier);
  if (!site) return;
  const state = await readFenceState(activeUserId);
  const now = new Date().toISOString();
  if (eventType === Location.GeofencingEventType.Enter) {
    // Entering only starts the wait: the check-in is sent once the person has stayed.
    if (state.open.includes(site.id)) return;
    const fix = await quickPosition();
    const crowd = fix ? ambiguousSitesAt(fix.position, sites) : [];
    if (crowd.some((one) => one.id === site.id)) {
      const key = nearKey(crowd);
      await updateFenceState(activeUserId, (current) => markNear(current, key));
      const [a, b] = crowd;
      if (!wasNear(state, key) && a && b) await announceNear(a.label, b.label);
      return;
    }
    await updateFenceState(activeUserId, (current) => enterSite(current, site.id, now));
    return;
  }
  // Leaving before the wait was over: a drive-past, nothing to send.
  if (hasPending(state, site.id)) {
    await updateFenceState(activeUserId, (current) => discardPending(current, site.id));
    return;
  }
  // Exits that come when the fence is registered, for sites with no visit, are noise.
  if (!state.open.includes(site.id) && !(await serverSaysOpen(site.id))) return;
  const fix = await quickPosition();
  await fenceQueue.add({
    userId: activeUserId,
    kind: 'exit',
    siteId: site.id,
    service: site.kind === 'service',
    label: site.label,
    eventAt: now,
    position: fix?.position ?? null,
    mocked: fix?.mocked ?? false,
  });
  await updateFenceState(activeUserId, (current) => markClosed(current, site.id));
  await flushFences(activeUserId).catch(() => undefined);
}

/**
 * The fence itself. It must be defined when the app's code loads (the root layout imports
 * this file), because the system can wake the app with no screen to run it.
 */
TaskManager.defineTask<{
  eventType?: Location.GeofencingEventType;
  region?: Location.LocationRegion;
}>(FENCE_TASK, async ({ data, error }) => {
  if (error || !data?.eventType || !data.region) return;
  await onEvent(data.eventType, data.region);
});

/** The region set as one string, to tell whether it changed. */
const keyOf = (regions: readonly FenceRegion[]): string =>
  regions
    .map((r) => `${r.identifier}|${r.latitude}|${r.longitude}|${r.radius}`)
    .sort()
    .join(';');

/**
 * Watches today's sites. Registering again makes the phone fire its first events again, so
 * the region set last registered is kept (it survives the app closing) and the same set with
 * the watch still running is left alone; with no sites, the watch stops.
 */
export async function syncFence(userId: string, sites: readonly DutySiteRecord[]): Promise<void> {
  const regions = regionsFor(sites);
  await writeFenceSites(userId, sites);
  if (regions.length === 0) {
    await stopFence(userId);
    return;
  }
  try {
    const key = keyOf(regions);
    const { registered } = await readFenceState(userId);
    if (registered === key && (await Location.hasStartedGeofencingAsync(FENCE_TASK))) return;
    await Location.startGeofencingAsync(FENCE_TASK, [...regions]);
    await updateFenceState(userId, (state) => markRegistered(state, key));
  } catch {
    await updateFenceState(userId, (state) => markRegistered(state, null));
  }
}

export async function stopFence(userId?: string): Promise<void> {
  if (userId) await updateFenceState(userId, (state) => markRegistered(state, null));
  try {
    if (await Location.hasStartedGeofencingAsync(FENCE_TASK))
      await Location.stopGeofencingAsync(FENCE_TASK);
  } catch {
    // Already stopped.
  }
}
