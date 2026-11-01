import { VOICE_NOTE_MAX_SECONDS } from '@oneohm/domain';
import {
  type RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_PRESET } from './request-media';

export type VoicePhase = 'idle' | 'starting' | 'recording';
export type VoiceProblem = 'denied' | 'failed' | null;

/**
 * Records one voice note: asks for the microphone, records up to two minutes (the
 * recorder stops by itself there) and hands the file over when it stops.
 */
export function useVoiceNote(onRecorded: (uri: string, seconds: number) => void) {
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [problem, setProblem] = useState<VoiceProblem>(null);
  const [length, setLength] = useState(0);
  // The latest length, for the listener that fires when the recorder finishes.
  const recorded = useRef(0);
  // Fires when the recording ends, whether the customer stopped it or it hit the cap.
  const finished = useCallback(
    (status: RecordingStatus) => {
      if (!status.isFinished || !status.url) return;
      setPhase('idle');
      onRecorded(status.url, recorded.current);
    },
    [onRecorded],
  );
  const recorder = useAudioRecorder(VOICE_PRESET, finished);
  const state = useAudioRecorderState(recorder, 250);
  useEffect(() => {
    if (!state.isRecording) return;
    recorded.current = state.durationMillis / 1000;
    setLength(recorded.current);
  }, [state.isRecording, state.durationMillis]);

  const start = useCallback(async () => {
    setProblem(null);
    setPhase('starting');
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setProblem('denied');
        setPhase('idle');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorded.current = 0;
      setLength(0);
      recorder.record({ forDuration: VOICE_NOTE_MAX_SECONDS });
      setPhase('recording');
    } catch {
      setProblem('failed');
      setPhase('idle');
    }
  }, [recorder]);

  const stop = useCallback(async () => {
    try {
      await recorder.stop();
    } catch {
      // Already stopped at the cap.
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
      () => undefined,
    );
    setPhase('idle');
    if (recorder.uri) onRecorded(recorder.uri, recorded.current);
  }, [recorder, onRecorded]);

  return {
    phase,
    problem,
    seconds: state.isRecording ? state.durationMillis / 1000 : length,
    max: VOICE_NOTE_MAX_SECONDS,
    start,
    stop,
  };
}
