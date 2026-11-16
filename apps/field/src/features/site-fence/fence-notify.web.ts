import type { QueuedFence } from './fence-queue';

/** No notices on the web. */
export async function prepareFenceNotices(): Promise<void> {
  // Not on the web.
}

export async function announceFence(_fence: QueuedFence, _left: unknown): Promise<void> {
  // Not on the web.
}

export async function announceNear(_first: string, _second: string): Promise<void> {
  // Not on the web.
}

export async function announceByHand(_label: string): Promise<void> {
  // Not on the web.
}
