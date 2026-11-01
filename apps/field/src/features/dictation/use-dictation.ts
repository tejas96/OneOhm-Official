import { useCallback, useEffect, useRef, useState } from 'react';
import { type DictationProblem, dictationLanguage, joinSpoken, problemOf } from './dictation-text';
import { deviceLocale, speech } from './speech';
import { canListen } from './speech-module';

interface Session {
  /** The note before this stretch of speech; heard words are added after it. */
  base: string;
  readonly onText: (text: string) => void;
}

/**
 * Speaking a note into a text box. Words appear as they are heard and the box can be
 * edited afterwards; listening stops on a tap or when the person falls silent. Only
 * offered where recognition really works (`available`): never in Expo Go or a build
 * without the module, and on the web only in browsers with the Web Speech API.
 */
export function useDictation() {
  const [available] = useState(() => canListen(speech));
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState<DictationProblem | null>(null);
  const session = useRef<Session | null>(null);

  useEffect(() => {
    if (!available || !speech) return;
    const module = speech;
    const subscriptions = [
      module.addListener('result', (event) => {
        const current = session.current;
        if (!current) return;
        const text = joinSpoken(current.base, event.results[0]?.transcript ?? '');
        current.onText(text);
        // A finished phrase becomes part of the note; the next one is added after it.
        if (event.isFinal) current.base = text;
      }),
      module.addListener('error', (event) => {
        if (!session.current) return;
        setProblem(problemOf(event.error));
      }),
      module.addListener('end', () => {
        session.current = null;
        setListening(false);
      }),
    ];
    return () => {
      for (const subscription of subscriptions) subscription.remove();
      // Leaving the screen while listening: stop without keeping anything more.
      if (session.current) module.abort();
      session.current = null;
    };
  }, [available]);

  const start = useCallback(async (base: string, onText: (text: string) => void) => {
    if (!speech) return;
    setProblem(null);
    const permission = await speech.requestPermissionsAsync().catch(() => ({ granted: false }));
    if (!permission.granted) {
      setProblem('denied');
      return;
    }
    session.current = { base, onText };
    setListening(true);
    try {
      speech.start({
        lang: dictationLanguage(deviceLocale()),
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        maxAlternatives: 1,
      });
    } catch {
      session.current = null;
      setListening(false);
      setProblem('failed');
    }
  }, []);

  const stop = useCallback(() => speech?.stop(), []);

  return { available, listening, problem, start, stop };
}
