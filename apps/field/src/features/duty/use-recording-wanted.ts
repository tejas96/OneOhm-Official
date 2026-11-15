import type { MyWorkday } from '@oneohm/api-contracts';
import { useSyncExternalStore } from 'react';
import { useCurrentUser } from '@/session/session-provider';
import { lastQueued } from '../attendance/tap-queue';
import { tapQueue } from '../attendance/tap-sender';
import { shouldRecord } from './duty-state';

/** Whether the route should be recording now for the signed-in person (see `shouldRecord`). */
export function useRecordingWanted(workday: MyWorkday | undefined): boolean {
  const user = useCurrentUser();
  const queue = useSyncExternalStore(tapQueue.subscribe, () => tapQueue.mine(user.id));
  return shouldRecord({
    day: workday?.today ?? null,
    queued: lastQueued(queue),
    consentGiven: workday?.consent.given ?? false,
    captureLocation: workday?.attendance.captureLocation ?? false,
  });
}
