import type { DutyPointInput } from '@oneohm/api-contracts';
import type { LocationObject } from 'expo-location';
import type { DeviceState } from '../attendance/device-state';

/** A route point as the phone keeps it until it is uploaded. */
export type DutyPoint = DutyPointInput;

/**
 * A fresh id for a point. It only has to be unique among this person's points (the server
 * keeps it per person), so the plain random version-4 shape is enough and needs no native
 * module.
 */
export function newPointId(random: () => number = Math.random): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const digit = Math.floor(random() * 16);
    return (char === 'x' ? digit : (digit & 0x3) | 0x8).toString(16);
  });
}

/** The phone reports -1 for "no speed" or "no heading". */
const known = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * One reading from the location service as a route point. The time is the reading's own, not
 * the moment it is saved, because points are often handled late (background wake-ups, no
 * signal); the battery and connection are those of the moment it is handled.
 */
export function dutyPointOf(
  location: LocationObject,
  device: DeviceState,
  id: string = newPointId(),
): DutyPoint {
  const { coords } = location;
  return {
    id,
    recordedAt: new Date(location.timestamp).toISOString(),
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracyM: known(coords.accuracy),
    speedMps: known(coords.speed),
    headingDeg: known(coords.heading),
    altitudeM: Number.isFinite(coords.altitude) ? coords.altitude : null,
    mocked: location.mocked === true,
    batteryPercent: device.batteryPercent,
    charging: device.charging,
    network: device.network,
  };
}
