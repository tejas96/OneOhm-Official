import { requireOptionalNativeModule } from 'expo';
import type { SpeechModule } from './speech-module';

/**
 * The phone's speech recogniser (`expo-speech-recognition`), looked up without
 * importing the package: its entry point throws when the native module is missing (Expo
 * Go, or a build made before it was added), and then the app simply shows no microphone.
 */
export const speech = requireOptionalNativeModule<SpeechModule>('ExpoSpeechRecognition');

/** The phone's language, e.g. "mr-IN" (Hermes reads it from the system). */
export function deviceLocale(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return null;
  }
}
