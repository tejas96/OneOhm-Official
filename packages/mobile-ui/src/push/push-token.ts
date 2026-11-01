import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushPlatform = 'ios' | 'android';

/** The EAS project the app was built for; Expo push tokens need it. */
function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? null;
}

/**
 * Asks once for permission and returns this phone's Expo push token, or null when
 * alerts cannot reach it (web, a simulator, no EAS project yet, or the person said no).
 */
export async function readPushToken(): Promise<{ token: string; platform: PushPlatform } | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;
  if (!Device.isDevice) return null;
  const projectId = easProjectId();
  if (!projectId) return null;
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Alerts',
      importance: Notifications.AndroidImportance.HIGH,
    });
  const current = await Notifications.getPermissionsAsync();
  const allowed = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!allowed) return null;
  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return { token: data, platform: Platform.OS };
}
