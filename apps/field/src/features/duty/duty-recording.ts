import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';
import { startBackground, stopBackground } from './duty-background';
import { recordLocations } from './duty-record';
import { RECORD_EVERY_M, RECORD_EVERY_MS } from './duty-settings';
import type { RouteMode } from './duty-state';
import { writePrefs } from './duty-store';

let watch: Location.LocationSubscription | null = null;
let watchFor = '';
/** The start under way, so concurrent calls share it instead of each opening a watch. */
let starting: { readonly userId: string; readonly promise: Promise<RouteMode> } | null = null;
/** Bumped by every stop: a watch that finished opening after a stop is closed at once. */
let generation = 0;

async function stopWatch(): Promise<void> {
  watch?.remove();
  watch = null;
}

/** With no "all the time" permission the route is recorded only while the app is open. */
async function startWatch(userId: string): Promise<void> {
  if (watch && watchFor === userId) return;
  await stopWatch();
  const mine = generation;
  const opened = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: RECORD_EVERY_MS,
      distanceInterval: RECORD_EVERY_M,
    },
    (location) => void recordLocations(userId, [location]),
  );
  if (mine !== generation) {
    opened.remove();
    return;
  }
  watchFor = userId;
  watch = opened;
}

/**
 * Starts recording for the person on duty with the permission the phone already gave:
 * background when "all the time" is allowed, else the foreground watch, else nothing. It
 * never asks; `askForPermission` does, after the explanation. Does nothing on the web.
 */
export function startRecording(userId: string): Promise<RouteMode> {
  if (Platform.OS === 'web') return Promise.resolve('off');
  if (starting?.userId === userId) return starting.promise;
  const promise = begin(userId).finally(() => {
    if (starting?.promise === promise) starting = null;
  });
  starting = { userId, promise };
  return promise;
}

async function begin(userId: string): Promise<RouteMode> {
  const mine = generation;
  try {
    await writePrefs({ activeUserId: userId });
    if (mine !== generation) return 'off';
    const foreground = await Location.getForegroundPermissionsAsync();
    if (!foreground.granted) {
      await stopWatch();
      await stopBackground();
      return 'no_permission';
    }
    const background = await Location.getBackgroundPermissionsAsync();
    if (background.granted) {
      try {
        await startBackground();
        await stopWatch();
        return 'on';
      } catch {
        // The service could not start (for example the phone refused it): record while open.
      }
    }
    await startWatch(userId);
    return 'foreground';
  } catch {
    return 'no_permission';
  }
}

/** Stops every way of recording and forgets who was on duty, so a late wake-up records nothing. */
export async function stopRecording(): Promise<void> {
  if (Platform.OS === 'web') return;
  generation += 1;
  starting = null;
  await stopWatch();
  await stopBackground();
  await writePrefs({ activeUserId: null });
}

/** Whether the phone already allows recording with the app closed. */
export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/**
 * Asks for the location permissions, after the explanation sheet: while using the app
 * first, then "all the time". When the phone will not ask again, the app's settings open
 * so the person can allow it there.
 */
export async function askForPermission(): Promise<void> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (!foreground.granted) {
    if (!foreground.canAskAgain) await Linking.openSettings();
    return;
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted && !background.canAskAgain) await Linking.openSettings();
}
