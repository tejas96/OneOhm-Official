import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { keys } from '@/api/api';
import { useToast } from '@/components/toast';
import { ATTENDANCE } from '@/copy/workforce';
import { useCurrentUser } from '@/session/session-provider';
import { requestCorrection } from './correction-request';
import { refusalNotice } from './tap-refusal';
import { sendTap, tapQueue } from './tap-sender';

/**
 * Sends the signed-in person's check-ins and check-outs kept for want of signal: on start,
 * when the phone finds a connection and when the app comes back to the front (A9). Taps of
 * someone else stay untouched. A 401 stops the run; it starts again at the next sign-in
 * (this mounts again) or the next time the app comes to the front. Renders nothing.
 */
export function TapQueueSync() {
  const client = useQueryClient();
  const toast = useToast();
  const user = useCurrentUser();
  useEffect(() => {
    const run = () =>
      void tapQueue.flush(sendTap, user.id).then(async ({ sent, refused }) => {
        if (sent > 0 || refused.length > 0)
          await client.invalidateQueries({ queryKey: keys.workday });
        if (sent > 0) toast(ATTENDANCE.sentLater);
        const [first] = refused;
        if (!first) return;
        const { message, correctionDate } = refusalNotice(first);
        if (correctionDate)
          toast(message, {
            onPress: () => {
              router.navigate('/');
              requestCorrection(correctionDate);
            },
          });
        else toast(message);
      });
    // A new sign-in starts the queue again after a 401.
    tapQueue.resume();
    run();
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        tapQueue.resume();
        run();
      }
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected !== false) run();
    });
    return () => {
      app.remove();
      network.remove();
    };
  }, [client, toast, user.id]);
  return null;
}
