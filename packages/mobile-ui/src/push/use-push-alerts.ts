import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { type PushPlatform, readPushToken } from './push-token';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

if (native)
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

/** What an alert carries to the phone: enough for the app to open the right screen. */
export interface AlertData {
  readonly notificationId?: string;
  readonly kind?: string;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly projectId?: string;
}

let registered: string | null = null;

/** The token this phone registered, so sign-out can stop its alerts. */
export function registeredPushToken(): string | null {
  return registered;
}

/**
 * Registers the phone for alerts once per sign-in, refreshes the inbox when an alert
 * arrives, and opens the right screen when the person taps one.
 */
export function usePushAlerts(options: {
  readonly register: (token: string, platform: PushPlatform) => Promise<unknown>;
  readonly onReceive: () => void;
  readonly onOpen: (data: AlertData) => void;
}) {
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!native) return;
    let active = true;
    let opened: string | null = null;
    const open = (response: Notifications.NotificationResponse | null) => {
      const id = response?.notification.request.identifier;
      if (!response || !id || id === opened) return;
      opened = id;
      latest.current.onOpen(response.notification.request.content.data as AlertData);
    };
    void readPushToken()
      .then(async (phone) => {
        if (!phone || !active) return;
        await latest.current.register(phone.token, phone.platform);
        registered = phone.token;
      })
      .catch(() => {
        // Alerts are a bonus: the inbox still works when the phone cannot register.
      });
    // An alert tapped while the app was closed opened it; handle that one too.
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active) open(response);
    });
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    const received = Notifications.addNotificationReceivedListener(() =>
      latest.current.onReceive(),
    );
    return () => {
      active = false;
      tapped.remove();
      received.remove();
    };
  }, []);
}
