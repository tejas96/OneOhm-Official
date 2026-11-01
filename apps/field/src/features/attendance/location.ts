import * as Location from 'expo-location';

export interface Reading {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyM: number | null;
}

/**
 * One reading of where the phone is, only at the moment of check-in or check-out
 * (PRD 4.3: no tracking in between). Null when permission is refused or no fix comes
 * within a few seconds; attendance is still recorded without it.
 */
export async function readLocation(): Promise<Reading | 'denied' | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return 'denied';
  try {
    const fix = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 8_000)),
    ]);
    if (!fix) return null;
    return {
      latitude: fix.coords.latitude,
      longitude: fix.coords.longitude,
      accuracyM: fix.coords.accuracy ?? null,
    };
  } catch {
    return null;
  }
}
