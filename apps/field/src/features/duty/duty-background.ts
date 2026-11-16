import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';
import { recordLocations } from './duty-record';
import { RECORD_EVERY_M, RECORD_EVERY_MS } from './duty-settings';
import { shouldStopBackground } from './duty-state';
import { readPrefs, writePrefs } from './duty-store';

/** The name the operating system knows the route recording by. */
export const DUTY_TASK = 'oneohm-duty-route';

/**
 * The recording itself. It must be defined when the app's code loads (the root layout
 * imports this file), because the system can wake the app with no screen to run it. It files
 * the readings under the person saved as on duty and, with nobody on duty, stops itself.
 */
TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(
  DUTY_TASK,
  async ({ data, error }) => {
    if (error) return;
    const { activeUserId } = await readPrefs();
    if (!activeUserId) {
      await stopBackground();
      return;
    }
    const result = await recordLocations(activeUserId, data?.locations ?? []);
    // A 401, or (with the app closed, where nothing else will notice) the server turning the
    // points away because the day is over or location is off: stop recording here and forget
    // who was on duty, so the phone is not kept recording for nobody or for the next person.
    if (shouldStopBackground(result, AppState.currentState === 'active')) {
      await stopBackground();
      await writePrefs({ activeUserId: null });
    }
  },
);

export async function backgroundRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(DUTY_TASK);
  } catch {
    return false;
  }
}

/**
 * Starts the background recording: about every 2 minutes or 100 m, balanced accuracy, with
 * the fixed notice Android requires and the blue indicator on iOS (nothing is hidden).
 */
export async function startBackground(): Promise<void> {
  if (await backgroundRunning()) return;
  await Location.startLocationUpdatesAsync(DUTY_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: RECORD_EVERY_MS,
    distanceInterval: RECORD_EVERY_M,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'OneOhm: on duty',
      notificationBody: 'Recording your duty route. Stops when you end duty.',
    },
  });
}

export async function stopBackground(): Promise<void> {
  try {
    if (await backgroundRunning()) await Location.stopLocationUpdatesAsync(DUTY_TASK);
  } catch {
    // Already stopped.
  }
}
