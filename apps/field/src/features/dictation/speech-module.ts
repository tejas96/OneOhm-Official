import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionOptions,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

/** The events this app listens to while a note is being spoken. */
export interface SpeechEvents {
  result: (event: ExpoSpeechRecognitionResultEvent) => void;
  error: (event: ExpoSpeechRecognitionErrorEvent) => void;
  end: () => void;
}

/** The part of `expo-speech-recognition` the app uses, the same on phones and the web. */
export interface SpeechModule {
  start(options: ExpoSpeechRecognitionOptions): void;
  stop(): void;
  abort(): void;
  requestPermissionsAsync(): Promise<{ readonly granted: boolean }>;
  isRecognitionAvailable(): boolean;
  addListener<K extends keyof SpeechEvents>(
    event: K,
    listener: SpeechEvents[K],
  ): { remove(): void };
}

/** True only when the recogniser can be used now; never throws. */
export function canListen(module: SpeechModule | null): module is SpeechModule {
  try {
    return module?.isRecognitionAvailable() === true;
  } catch {
    return false;
  }
}
