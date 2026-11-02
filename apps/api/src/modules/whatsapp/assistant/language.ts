import { AsyncLocalStorage } from 'node:async_hooks';

/** The languages the assistant speaks: English, Marathi and Hindi (PRD 5.1). */
export type AssistantLanguage = 'en' | 'mr' | 'hi';

const current = new AsyncLocalStorage<AssistantLanguage>();

/** Runs one customer message in their language; every word list follows it. */
export function inLanguage<T>(language: AssistantLanguage, run: () => Promise<T>): Promise<T> {
  return current.run(language, run);
}

export const languageNow = (): AssistantLanguage => current.getStore() ?? 'en';

/** "mr-IN" → "mr"; anything else is English. */
export function assistantLanguage(preferred: string | null | undefined): AssistantLanguage {
  const code = (preferred ?? '').slice(0, 2);
  return code === 'mr' || code === 'hi' ? code : 'en';
}

/** The same shape with plain strings, so a translation can say anything. */
export type Words<T> = T extends (...args: infer A) => infer R
  ? (...args: A) => Words<R>
  : T extends string
    ? string
    : T extends readonly (infer U)[]
      ? readonly Words<U>[]
      : T extends object
        ? { readonly [K in keyof T]: Words<T[K]> }
        : T;

/**
 * A word list that answers in the language of the message being handled. Callers keep
 * writing `WORDS.menu(...)`; outside a message it is English.
 */
export function localized<T extends object>(
  en: T,
  others: { readonly mr: Words<T>; readonly hi: Words<T> },
): T {
  return new Proxy(en, {
    get: (_target, key) => {
      const language = languageNow();
      return Reflect.get(language === 'en' ? en : others[language], key);
    },
  });
}
