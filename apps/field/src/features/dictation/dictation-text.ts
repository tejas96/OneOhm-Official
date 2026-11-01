/**
 * Pure rules for notes spoken instead of typed (PRD 4.4 "Voice-to-text progress notes").
 * What is heard is added to what is already in the box; the person edits before saving.
 */

const SENTENCE_END = /[.!?।]\s*$/;

/** First letter up, for a new sentence (scripts without case are left as they are). */
const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The note with `spoken` added after `base`: a space between words, a capital letter
 * when it starts the note or a new sentence, and nothing changed when nothing was heard.
 */
export function joinSpoken(base: string, spoken: string): string {
  const words = spoken.trim().replace(/\s+/g, ' ');
  if (!words) return base;
  if (base.trim() === '') return capitalised(words);
  const next = SENTENCE_END.test(base) ? capitalised(words) : words;
  return /\s$/.test(base) ? `${base}${next}` : `${base} ${next}`;
}

export type DictationLanguage = 'en-IN' | 'mr-IN' | 'hi-IN';

/**
 * Listen in the phone's own language when it is Marathi or Hindi, else English (India).
 * The app itself is in English, so anything else falls back to English (India).
 */
export function dictationLanguage(locale: string | null | undefined): DictationLanguage {
  const language = (locale ?? '').toLowerCase().split(/[-_]/)[0];
  if (language === 'mr') return 'mr-IN';
  if (language === 'hi') return 'hi-IN';
  return 'en-IN';
}

export type DictationProblem = 'denied' | 'noSpeech' | 'offline' | 'failed';

/**
 * What to tell the person after a recognition error; null when there is nothing to say
 * (they stopped it themselves).
 */
export function problemOf(error: string): DictationProblem | null {
  switch (error) {
    case 'aborted':
      return null;
    case 'no-speech':
    case 'speech-timeout':
    case 'nomatch':
      return 'noSpeech';
    case 'not-allowed':
    case 'service-not-allowed':
      return 'denied';
    case 'network':
      return 'offline';
    default:
      return 'failed';
  }
}
