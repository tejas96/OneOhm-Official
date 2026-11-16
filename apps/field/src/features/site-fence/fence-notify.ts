import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { FENCE } from '@/copy/site';
import { clock24 } from '@/lib/dates';
import type { QueuedFence } from './fence-queue';
import { markShown, wasShown } from './fence-state';
import { readFenceState, updateFenceState } from './fence-store';
import { type FenceNoticeData, LEFT_CATEGORY, noticeIsFresh } from './fence-text';

const CHANNEL = 'default';

const subject = (fence: QueuedFence) => ({
  subjectType: fence.service ? ('service_request' as const) : ('task' as const),
  subjectId: fence.siteId,
});

/**
 * Sets up the notices once the person is on duty: the Android channel, the "Why?" buttons,
 * and the phone's permission to show them (asked once, here, with the app open).
 */
export async function prepareFenceNotices(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Alerts',
        importance: Notifications.AndroidImportance.HIGH,
      });
    await Notifications.setNotificationCategoryAsync(
      LEFT_CATEGORY,
      (Object.keys(FENCE.reasons) as (keyof typeof FENCE.reasons)[]).map((reason) => ({
        identifier: reason,
        buttonTitle: FENCE.reasons[reason],
        // The app opens, so the reason is sent with a session and the person sees the job.
        options: { opensAppToForeground: true },
      })),
    );
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) await Notifications.requestPermissionsAsync();
  } catch {
    // Notices are a help: the visit is saved either way.
  }
}

async function show(
  title: string,
  body: string | undefined,
  data: FenceNoticeData,
  category?: string,
) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      ...(body ? { body } : {}),
      data: { ...data },
      ...(category ? { categoryIdentifier: category } : {}),
    },
    trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null,
  });
}

/**
 * Tells the person what the fence just did, once the server took it: "At Sharma home,
 * checked in 10:42" on entering; on leaving, "Left Sharma home. Job not finished, why?" with
 * the three reasons, only when the server says the job is not done and no reason was given.
 * An event that waited hours for signal is not announced.
 */
export async function announceFence(
  fence: QueuedFence,
  left: { readonly visitId: string; readonly done: boolean; readonly reasonGiven: boolean } | null,
): Promise<void> {
  if (Platform.OS === 'web' || !noticeIsFresh(fence.eventAt)) return;
  try {
    if (fence.kind === 'enter') {
      await show(FENCE.checkedIn(fence.label, clock24(fence.eventAt)), undefined, {
        kind: 'site_entered',
        ...subject(fence),
      });
      return;
    }
    if (!left || left.done || left.reasonGiven) return;
    // Once per visit: a fence that fires again for the same visit does not ask again.
    if (wasShown(await readFenceState(fence.userId), left.visitId)) return;
    await updateFenceState(fence.userId, (state) => markShown(state, left.visitId));
    await show(
      FENCE.leftTitle(fence.label),
      FENCE.leftBody,
      { kind: 'site_left_ask', ...subject(fence), visitId: left.visitId },
      LEFT_CATEGORY,
    );
  } catch {
    // Not announced; the visit stands.
  }
}

/** "You are near A and B. Tap to check in." Opens the Today screen. */
export async function announceNear(first: string, second: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await show(FENCE.near(first, second), undefined, { kind: 'site_near' });
  } catch {
    // The person can still check in from Today.
  }
}

/** An arrival the server would not take automatically (too old): check in by hand. */
export async function announceByHand(label: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await show(FENCE.byHand(label), undefined, { kind: 'site_by_hand' });
  } catch {
    // The person can still check in from Today.
  }
}
