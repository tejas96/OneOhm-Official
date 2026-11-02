import * as Location from 'expo-location';
import { GIVE_UP_MS, pickBest, shouldStop } from './best-reading';
import { readDeviceState } from './device-state';
import type { Reading } from './location';

/**
 * A careful reading for pinning a roof or a site visit: listens to the GPS until it is
 * within 10 m or 15 s have passed, then keeps the most accurate fix. Same result as
 * `readLocation()`: a reading, 'denied', or null when there was no fix at all. The
 * listener is always removed.
 */
export async function readPreciseLocation(
  onProgress?: (accuracyM: number | null) => void,
): Promise<Reading | 'denied' | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return 'denied';
  const fixes: { latitude: number; longitude: number; accuracyM: number | null }[] = [];
  const watch: { sub: Location.LocationSubscription | null; closed: boolean } = {
    sub: null,
    closed: false,
  };
  try {
    const started = Date.now();
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, GIVE_UP_MS);
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Highest, timeInterval: 1000, distanceInterval: 0 },
        (fix) => {
          const accuracyM = fix.coords.accuracy ?? null;
          fixes.push({
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
            accuracyM,
          });
          onProgress?.(accuracyM);
          const best = pickBest(fixes);
          const bestM = best === null ? null : (fixes[best]?.accuracyM ?? null);
          if (shouldStop(bestM, Date.now() - started)) {
            finish();
          }
        },
      ).then((sub) => {
        // The watch can start after we gave up; then drop it straight away.
        if (watch.closed) sub.remove();
        else watch.sub = sub;
      }, finish);
    });
    const index = pickBest(fixes);
    const best = index === null ? undefined : fixes[index];
    if (!best) return null;
    return { ...best, ...(await readDeviceState()) };
  } catch {
    return null;
  } finally {
    watch.closed = true;
    watch.sub?.remove();
  }
}
