import { ambiguousSitesAt } from '@oneohm/domain';
import type { LocationObject } from 'expo-location';
import { announceNear } from './fence-notify';
import { fenceQueue, flushFences } from './fence-sender';
import {
  discardPending,
  dropStalePending,
  dueArrival,
  markNear,
  markOpen,
  nearKey,
  wasNear,
} from './fence-state';
import { readFenceSites, readFenceState, updateFenceState } from './fence-store';

/**
 * Confirms arrivals on each new reading (Duty Day step 3). A fence Enter only left a pending
 * arrival; when a reading shows the person still inside that site's fence, exact enough, not
 * fake and at least 5 minutes after the Enter, the check-in is sent with the Enter's time and
 * that reading. Within two sites' fences nothing is sent: the person is asked to check in by
 * hand. Called for every reading of the duty route, background or foreground; it returns at
 * once when nothing is pending and never throws.
 */
export async function checkArrivals(
  userId: string,
  locations: readonly LocationObject[],
): Promise<void> {
  try {
    if (locations.length === 0) return;
    const first = await readFenceState(userId);
    if (first.pending.length === 0) return;
    const sites = await readFenceSites(userId);
    const ordered = [...locations].sort((a, b) => a.timestamp - b.timestamp);
    let sent = false;
    for (const location of ordered) {
      const state = await readFenceState(userId);
      const point = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyM: location.coords.accuracy,
        mocked: location.mocked === true,
        at: location.timestamp,
      };
      const due = dueArrival(state, point, sites);
      if (!due) continue;
      const crowd = ambiguousSitesAt(point, sites);
      if (crowd.some((site) => site.id === due.site.id)) {
        const key = nearKey(crowd);
        await updateFenceState(userId, (now) => markNear(discardPending(now, due.site.id), key));
        const [a, b] = crowd;
        if (!wasNear(state, key) && a && b) await announceNear(a.label, b.label);
        continue;
      }
      await fenceQueue.add({
        userId,
        kind: 'enter',
        siteId: due.site.id,
        service: due.site.kind === 'service',
        label: due.site.label,
        eventAt: due.arrival.enteredAt,
        position: {
          latitude: point.latitude,
          longitude: point.longitude,
          accuracyM: point.accuracyM,
        },
        mocked: false,
      });
      await updateFenceState(userId, (now) =>
        markOpen(discardPending(now, due.site.id), due.site.id),
      );
      sent = true;
    }
    await updateFenceState(userId, (state) => dropStalePending(state, Date.now()));
    if (sent) await flushFences(userId).catch(() => undefined);
  } catch {
    // The route is recorded either way; the person can check in by hand.
  }
}
