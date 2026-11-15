import type { LocationObject } from 'expo-location';
import { readDeviceState } from '../attendance/device-state';
import { checkArrivals } from '../site-fence/fence-dwell';
import { flushWhenDue } from './duty-flush';
import { dutyPointOf } from './duty-point';
import type { DutyFlush } from './duty-queue';
import { dutyQueue } from './duty-sender';

/**
 * Keeps the readings the location service handed over, filed under the person on duty. One
 * device reading (battery, connection) is shared by the readings of one hand-over. Called by
 * the background task and by the foreground watch alike.
 */
export async function recordLocations(
  userId: string,
  locations: readonly LocationObject[],
): Promise<DutyFlush | null> {
  if (locations.length === 0) return null;
  const device = await readDeviceState();
  await dutyQueue.add(
    userId,
    locations.map((location) => dutyPointOf(location, device)),
  );
  // A fence Enter waits for the person to stay; each new reading may confirm it.
  await checkArrivals(userId, locations);
  return flushWhenDue(userId).catch(() => null);
}
