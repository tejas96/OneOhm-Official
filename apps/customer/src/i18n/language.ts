import { type CustomerLanguage, DEFAULT_CUSTOMER_LANGUAGE } from '@oneohm/domain';
import { useSyncExternalStore } from 'react';

/**
 * The language the app speaks right now (PRD 5.1). Copy modules read it each time a
 * string is read; the root layout re-mounts the screens when it changes, so every
 * screen (and the React Compiler's cached output) starts fresh in the new language.
 */
let current: CustomerLanguage = DEFAULT_CUSTOMER_LANGUAGE;
const listeners = new Set<() => void>();

export function currentLanguage(): CustomerLanguage {
  return current;
}

export function setLanguage(next: CustomerLanguage): void {
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useLanguage(): CustomerLanguage {
  return useSyncExternalStore(subscribe, currentLanguage, currentLanguage);
}

/** Month and day names in the language, with the same digits as ₹ amounts and codes. */
const DATE_LOCALE: Readonly<Record<CustomerLanguage, string>> = {
  'en-IN': 'en-IN',
  'mr-IN': 'mr-IN-u-nu-latn',
  'hi-IN': 'hi-IN-u-nu-latn',
};

export function dateLocale(language: CustomerLanguage = current): string {
  return DATE_LOCALE[language];
}
