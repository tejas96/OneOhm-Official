import { VOICE_NOTE_MAX_SECONDS } from '@oneohm/domain';
import {
  type RecordingStatus,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useCallback, useEffect, useState } from 'react';
import { VOICE_NOTE_PRESET } from './voice-preset';

export type RecorderPhase = 'idle' | 'starting' | 'recording' | 'recorded';
export type RecorderProblem = 'denied' | 'failed' | null;

/**
 * One voice note: ask for the microphone, record up to the cap (the recorder stops by
 * itself at two minutes), then keep the file for playback, re-recording or saving.
 */
export function useVoiceRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>('idle');
  const [uri, setUri] = useState<string | null>(null);
  const [problem, setProblem] = useState<RecorderProblem>(null);
  const [length, setLength] = useState(0);
  const finished = useCallback((status: RecordingStatus) => {
    if (!status.isFinished || !status.url) return;
    setUri(status.url);
    setPhase('recorded');
  }, []);
  const recorder = useAudioRecorder(VOICE_NOTE_PRESET, finished);
  const state = useAudioRecorderState(recorder, 200);
  useEffect(() => {
    if (state.isRecording) setLength(state.durationMillis / 1000);
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
      // Already stopped at the two-minute cap.
    }
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(
      () => undefined,
    );
    if (recorder.uri) {
      setUri(recorder.uri);
      setPhase('recorded');
    }
  }, [recorder]);

  const reset = useCallback(() => {
    if (recorder.isRecording) void recorder.stop().catch(() => undefined);
    setUri(null);
    setProblem(null);
    setLength(0);
    setPhase('idle');
  }, [recorder]);

  return {
    phase,
    uri,
    problem,
    /** Seconds recorded: live while recording, the final length afterwards. */
    seconds: state.isRecording ? state.durationMillis / 1000 : length,
    max: VOICE_NOTE_MAX_SECONDS,
    start,
    stop,
    reset,
  };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;
