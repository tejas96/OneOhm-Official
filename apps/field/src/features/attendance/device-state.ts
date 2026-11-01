import * as Battery from 'expo-battery';
import * as Network from 'expo-network';

export type Connection = 'wifi' | 'cellular' | 'none' | 'other';

/** The phone's battery and connection at a reading, where the phone tells us (PRD 4.3). */
export interface DeviceState {
  readonly batteryPercent: number | null;
  readonly charging: boolean | null;
  readonly network: Connection | null;
}

const NOTHING: DeviceState = { batteryPercent: null, charging: null, network: null };

/** Waits this long at most: device details must never hold up a check-in. */
const WAIT_MS = 1_500;

async function battery(): Promise<Pick<DeviceState, 'batteryPercent' | 'charging'>> {
  try {
    if (!(await Battery.isAvailableAsync())) return { batteryPercent: null, charging: null };
    const power = await Battery.getPowerStateAsync();
    const level = power.batteryLevel;
    const state = power.batteryState;
    return {
      batteryPercent: level >= 0 && level <= 1 ? Math.round(level * 100) : null,
      charging:
        state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL
          ? true
          : state === Battery.BatteryState.UNKNOWN
            ? null
            : false,
    };
  } catch {
    return { batteryPercent: null, charging: null };
  }
}

async function connection(): Promise<Connection | null> {
  try {
    const state = await Network.getNetworkStateAsync();
    if (state.isConnected === false || state.type === Network.NetworkStateType.NONE) return 'none';
    if (state.type === Network.NetworkStateType.WIFI) return 'wifi';
    if (state.type === Network.NetworkStateType.CELLULAR) return 'cellular';
    if (state.type === Network.NetworkStateType.UNKNOWN) return null;
    return 'other';
  } catch {
    return null;
  }
}

/** Battery and connection now, or nothing when the phone does not say in time. */
export async function readDeviceState(): Promise<DeviceState> {
  const read = Promise.all([battery(), connection()]).then(([power, network]) => ({
    ...power,
    network,
  }));
  const late = new Promise<DeviceState>((resolve) => setTimeout(() => resolve(NOTHING), WAIT_MS));
  try {
    return await Promise.race([read, late]);
  } catch {
    return NOTHING;
  }
}
