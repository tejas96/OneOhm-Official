import { describeError } from '@oneohm/mobile-ui';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useToast } from '@/components/toast';
import { pendingPins, pinQueue } from './pin-queue';
import { siteKeys } from './use-task-site';

/**
 * Sends the roof pin kept on this phone for the task, if any (spec 9), in turn with any
 * other save. Never throws. Returns the server's reason when it refused the pin (the pin
 * is then dropped), so the caller can tell the worker; else null.
 */
export async function resendPendingPin(
  taskId: string,
  client: QueryClient,
): Promise<string | null> {
  const { result, refused } = await pinQueue.resend(taskId);
  if (result) client.setQueryData(siteKeys.task(taskId), result);
  return refused ? describeError(refused) : null;
}

/**
 * The last roof pin for this task that failed for want of signal. It is sent again when
 * the app comes back to the front or the phone finds a connection, and before Complete
 * and check-out (callers use `resendPendingPin`).
 */
export function usePendingPin(taskId: string) {
  const client = useQueryClient();
  const toast = useToast();
  const pending = useSyncExternalStore(pendingPins.subscribe, () => pendingPins.get(taskId));
  useEffect(() => {
    const retry = () =>
      void resendPendingPin(taskId, client).then((refused) => {
        if (refused) toast(refused);
      });
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') retry();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected !== false) retry();
    });
    return () => {
      app.remove();
      network.remove();
    };
  }, [taskId, client, toast]);
  return { pending };
}
