import { ExpoSpeechRecognitionModule as web } from 'expo-speech-recognition';
import type { SpeechModule } from './speech-module';

const supported =
  typeof window !== 'undefined' &&
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

/**
 * The browser's Web Speech API through `expo-speech-recognition`'s web module. The
 * browser asks for the microphone itself when listening starts, so there is no separate
 * permission step here.
 */
export const speech: SpeechModule | null = supported
  ? {
      start: (options) => web.start(options),
      stop: () => web.stop(),
      abort: () => web.abort(),
      requestPermissionsAsync: async () => ({ granted: true }),
      isRecognitionAvailable: () => web.isRecognitionAvailable(),
      addListener: (event, listener) => web.addListener(event, listener as never),
    }
  : null;

export function deviceLocale(): string | null {
  return typeof navigator === 'undefined' ? null : navigator.language;
}
