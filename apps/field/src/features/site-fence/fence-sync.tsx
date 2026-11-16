import type { DutySiteRecord } from '@oneohm/api-contracts';
import { describeError, unwrap } from '@oneohm/mobile-ui';
import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api } from '@/api/api';
import { useToast } from '@/components/toast';
import { FENCE } from '@/copy/site';
import { useWorkday } from '@/features/attendance/use-workday';
import { hasBackgroundPermission } from '@/features/duty/duty-recording';
import { useRecordingWanted } from '@/features/duty/use-recording-wanted';
import { useCurrentUser } from '@/session/session-provider';
import { prepareFenceNotices } from './fence-notify';
import { fenceWanted } from './fence-regions';
import { fenceQueue, flushFences } from './fence-sender';
import { stopFence, syncFence } from './fence-task';
import { jobHref, opensToday, reasonFrom } from './fence-text';
import { useDutySites } from './use-duty-sites';

const NONE: readonly DutySiteRecord[] = [];

/**
 * Runs the phone's site fence for the signed-in person, mounted once in the signed-in
 * layout beside the duty recorder (Duty Day step 3). While the route is recording with the
 * "all the time" permission it watches today's sites; it reads them again when duty starts,
 * when the app comes to the front and when the person's jobs change, and stops at End duty,
 * at sign-out and when consent is withdrawn. Fence events waiting for signal are sent when
 * the phone finds a connection. Renders nothing; does nothing on the web.
 */
export function SiteFence() {
  const client = useQueryClient();
  const user = useCurrentUser();
  const workday = useWorkday();
  const onDuty = useRecordingWanted(workday.data);
  const [background, setBackground] = useState(false);
  const duty = useDutySites(onDuty);
  const sites = duty.sites ?? NONE;
  const { refetch } = duty;

  // The "all the time" permission can change in the phone's settings: read it again whenever
  // duty starts and when the app comes back.
  useEffect(() => {
    if (Platform.OS === 'web' || !onDuty) return;
    const read = () => void hasBackgroundPermission().then(setBackground);
    read();
    const app = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      read();
      void refetch();
    });
    return () => app.remove();
  }, [onDuty, refetch]);

  const wanted = fenceWanted({ onDuty, backgroundAllowed: background, sites: sites.length });
  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!wanted) {
      void stopFence(user.id);
      return;
    }
    void prepareFenceNotices().then(() => syncFence(user.id, sites));
    // The list keeps its identity while the sites are the same, so nothing is registered twice.
  }, [wanted, sites, user.id]);

  // Sign-out unmounts this: the fence ends with the session.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    return () => void stopFence(user.id);
  }, [user.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    fenceQueue.resume();
    const run = () =>
      void flushFences(user.id).then(async ({ sent }) => {
        if (sent > 0) await client.invalidateQueries({ queryKey: ['site'] });
      });
    void fenceQueue.load().then(run);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        fenceQueue.resume();
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
  }, [client, user.id]);
  return <FenceReasons />;
}

/**
 * The three buttons on "Left X. Job not finished, why?": a tap sends that reason. A tap on the
 * "near two sites" or "check in by hand" notice opens Today. Each response is handled once and
 * then cleared, so it is not found again when the app next starts or comes to the front.
 */
function FenceReasons() {
  const toast = useToast();
  const client = useQueryClient();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const answer = async (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      if (opensToday(response)) {
        Notifications.clearLastNotificationResponse();
        router.push('/' as Href);
        return;
      }
      const answered = reasonFrom(response);
      if (!answered || answered.id === handled.current) return;
      handled.current = answered.id;
      Notifications.clearLastNotificationResponse();
      try {
        await unwrap(
          api.siteActivity.leaveReasonSiteVisit({
            params: { id: answered.data.visitId },
            body: { reason: answered.reason },
          }),
        );
        toast(FENCE.reasonSaved);
        await client.invalidateQueries({ queryKey: ['site'] });
      } catch (error) {
        // Already answered (the person tapped twice): nothing more to do.
        if ((error as { code?: unknown } | null)?.code === 'reason_given') return;
        toast(describeError(error));
        // The job screen is where the person can try again.
        router.push(jobHref(answered.data) as Href);
      }
    };
    void Notifications.getLastNotificationResponseAsync().then(answer);
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      void answer(response);
    });
    return () => sub.remove();
  }, [client, toast]);
  return null;
}
