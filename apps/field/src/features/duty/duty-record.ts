import type { LocationObject } from 'expo-location';
import { readDeviceState } from '../attendance/device-state';
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
  return flushWhenDue(userId).catch(() => null);
}
