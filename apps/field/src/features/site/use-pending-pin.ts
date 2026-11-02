import type { GeoPoint } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api } from '@/api/api';
import { createPendingPins } from './pending-pins';
import { shouldKeepPin } from './pin-flow';
import { siteKeys } from './use-task-site';

const pins = createPendingPins();
const sending = new Set<string>();

/**
 * Sends the roof pin kept on this phone for the task, if any (spec 9). Never throws: a
 * pin that still has no signal stays; one the server refuses is dropped.
 */
export async function resendPendingPin(taskId: string, client: QueryClient): Promise<void> {
  const pin = pins.get(taskId);
  if (!pin || sending.has(taskId)) return;
  sending.add(taskId);
  try {
    const site = await unwrap(
      api.siteActivity.saveSiteLocation({ params: { id: taskId }, body: { pin } }),
    );
    pins.drop(taskId, pin);
    client.setQueryData(siteKeys.task(taskId), site);
  } catch (error) {
    if (!shouldKeepPin(error)) pins.drop(taskId, pin);
  } finally {
    sending.delete(taskId);
  }
}

/**
 * The last roof pin for this task that failed for want of signal. It is sent again when
 * the app comes back to the front or the phone finds a connection, and before Complete
 * and check-out (callers use `resendPendingPin`).
 */
export function usePendingPin(taskId: string) {
  const client = useQueryClient();
  const pending = useSyncExternalStore(pins.subscribe, () => pins.get(taskId));
  useEffect(() => {
    const retry = () => void resendPendingPin(taskId, client);
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
  }, [taskId, client]);
  return { pending, keep: (pin: GeoPoint) => pins.keep(taskId, pin) };
}
