import type { LeftVisit } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { api, currentToken, setToken, tokenStore } from '@/api/api';
import { announceByHand, announceFence } from './fence-notify';
import { createFenceQueue, type QueuedFence } from './fence-queue';
import { markClosed } from './fence-state';
import { fenceStore, updateFenceState } from './fence-store';

/** Fence events kept on this phone until they reach the server. */
export const fenceQueue = createFenceQueue(fenceStore);

/**
 * Sends one fence event as the phone's own check-in or check-out, with the time the phone saw
 * it. The fence task can wake with the app closed and no sign-in in memory, so the saved
 * session is read first. After the server took it, the person is told what happened.
 */
export async function sendFence(fence: QueuedFence) {
  if (!currentToken()) {
    const saved = await tokenStore.read();
    if (saved) setToken(saved);
  }
  const params = { id: fence.siteId };
  const body = {
    position: fence.position,
    source: 'auto_fence' as const,
    tappedAt: fence.eventAt,
    mocked: fence.mocked,
  };
  const enter = fence.kind === 'enter';
  let justLeft: LeftVisit | null;
  let skipped: unknown;
  if (fence.service) {
    const call = enter ? api.serviceVisits.serviceCheckIn : api.serviceVisits.serviceCheckOut;
    const result = await unwrap(call({ params, body }));
    justLeft = result.justLeft;
    skipped = result.autoSkipped;
  } else {
    const call = enter ? api.siteActivity.siteCheckIn : api.siteActivity.siteCheckOut;
    const result = await unwrap(call({ params, body }));
    justLeft = result.justLeft;
    skipped = result.autoSkipped;
  }
  // The server left the check-in alone (still at a site just left, or between two sites).
  if (enter && skipped) {
    await updateFenceState(fence.userId, (state) => markClosed(state, fence.siteId));
    return justLeft;
  }
  await announceFence(fence, justLeft);
  return justLeft;
}

/**
 * Sends the person's waiting events. An arrival the server found too old (over 2 hours) is
 * dropped by the queue and the person is told to check in by hand; a fake location is dropped
 * without a word.
 */
export async function flushFences(userId: string) {
  const result = await fenceQueue.flush(sendFence, userId);
  for (const { tap, error } of result.refused) {
    const code = (error as { code?: unknown } | null)?.code;
    if (tap.kind !== 'enter') continue;
    await updateFenceState(userId, (state) => markClosed(state, tap.siteId));
    if (code === 'auto_event_too_old') await announceByHand(tap.label);
  }
  return result;
}
