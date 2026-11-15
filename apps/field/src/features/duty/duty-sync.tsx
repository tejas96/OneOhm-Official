import { useQueryClient } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { keys } from '@/api/api';
import { useCurrentUser } from '@/session/session-provider';
import { useWorkday } from '../attendance/use-workday';
import { flushDuty, onDutyFlushed } from './duty-flush';
import { hasBackgroundPermission, startRecording, stopRecording } from './duty-recording';
import { dutyQueue } from './duty-sender';
import { FLUSH_EVERY_MS } from './duty-settings';
import { dutyStatus } from './duty-status';
import { pruneOldFiles } from './duty-store';
import { useRecordingWanted } from './use-recording-wanted';

/** Why the server turned points away that mean the Today card is out of date. */
const STALE_DAY = ['no_open_day', 'outside_duty', 'no_consent', 'policy_off'];

/**
 * Runs the duty route for the signed-in person, mounted once in the signed-in layout: it
 * starts recording while the day is open (also on app start), stops it at check-out, when
 * the server says the day is closed, when consent is withdrawn and at sign-out, and uploads
 * the waiting points every 5 minutes, when the app comes to the front and when the phone
 * finds a connection. Renders nothing; does nothing on the web.
 */
export function DutyRecorder() {
  const client = useQueryClient();
  const user = useCurrentUser();
  const workday = useWorkday();
  const wanted = useRecordingWanted(workday.data);
  const known = workday.data !== undefined;
  // The explanation opens once per duty day; the status line opens it again on a tap.
  const explained = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void pruneOldFiles();
    void dutyQueue.load(user.id);
    // Signing out unmounts this: the recording ends with the session.
    return () => void stopRecording();
  }, [user.id]);

  useEffect(() => {
    // Until the day is known nothing is started or stopped: a phone that opens offline keeps
    // recording what it was already recording.
    if (Platform.OS === 'web' || !known) return;
    let cancelled = false;
    if (!wanted) {
      explained.current = false;
      dutyStatus.set({ mode: 'off', explain: false });
      void stopRecording().then(() => flushDuty(user.id));
      return;
    }
    void startRecording(user.id).then(async (mode) => {
      if (cancelled) return;
      dutyStatus.set({ mode });
      if (mode !== 'on' && !explained.current && !(await hasBackgroundPermission())) {
        explained.current = true;
        dutyStatus.set({ explain: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wanted, known, user.id]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const run = () => void flushDuty(user.id).catch(() => undefined);
    const refresh = () => {
      dutyQueue.resume(user.id);
      void client.invalidateQueries({ queryKey: keys.workday });
      run();
      // Back from the phone's settings, a permission may have changed.
      if (wanted) void startRecording(user.id).then((mode) => dutyStatus.set({ mode }));
    };
    const done = onDutyFlushed((result) => {
      dutyStatus.set({ stalled: result.stalled });
      if (result.reasons.some((reason) => STALE_DAY.includes(reason)))
        void client.invalidateQueries({ queryKey: keys.workday });
    });
    const timer = setInterval(run, FLUSH_EVERY_MS);
    const app = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const network = Network.addNetworkStateListener((state) => {
      if (state.isConnected !== false) run();
    });
    run();
    return () => {
      clearInterval(timer);
      done();
      app.remove();
      network.remove();
    };
  }, [client, user.id, wanted]);
  return null;
}
