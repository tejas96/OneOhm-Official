/**
 * Languages the apps speak, as BCP 47 tags so dates and numbers follow Indian
 * conventions (1 November, ₹18,40,000). English ships first; Marathi and Hindi
 * are added by dropping `messages/mr-IN.json` / `messages/hi-IN.json` in and
 * listing them here. Every screen reads its words from the message files.
 */
export const SUPPORTED_LOCALES = ['en-IN'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en-IN';
export const LOCALE_COOKIE = 'oneohm-locale';

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}
