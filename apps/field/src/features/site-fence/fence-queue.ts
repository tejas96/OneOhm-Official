import type { PositionInput } from '@oneohm/api-contracts';
import { createTapQueue, type TapStore } from '../attendance/tap-queue';

/** A site fence event waiting for signal, with the time it happened on the phone. */
export interface QueuedFence {
  /** Whose phone event it is: only sent while that person is signed in. */
  readonly userId: string;
  readonly kind: 'enter' | 'exit';
  /** The task, or the service request when `service`. */
  readonly siteId: string;
  readonly service: boolean;
  readonly label: string;
  /** When the phone saw the event, ISO. */
  readonly eventAt: string;
  /** The phone's reading, or null when none came quickly (never the site's centre). */
  readonly position: PositionInput | null;
  /** The reading is a fake (mock) location. */
  readonly mocked: boolean;
}

export type FenceStore = TapStore<QueuedFence>;

export function parseFences(raw: unknown): QueuedFence[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): QueuedFence[] => {
    const fence = item as Partial<QueuedFence> | null;
    if (
      !fence ||
      typeof fence.userId !== 'string' ||
      (fence.kind !== 'enter' && fence.kind !== 'exit') ||
      typeof fence.siteId !== 'string' ||
      typeof fence.eventAt !== 'string'
    )
      return [];
    return [
      {
        userId: fence.userId,
        kind: fence.kind,
        siteId: fence.siteId,
        service: fence.service === true,
        label: typeof fence.label === 'string' ? fence.label : '',
        eventAt: fence.eventAt,
        position: fence.position ?? null,
        mocked: fence.mocked === true,
      },
    ];
  });
}

/** Events kept on this phone for want of signal: the same queue as attendance taps, per person. */
export const createFenceQueue = (store: FenceStore) => createTapQueue<QueuedFence>(store);
