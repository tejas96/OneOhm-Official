/**
 * The languages the customer app speaks (PRD 5.1). The customer record keeps one of these
 * in `customers.preferred_language`; anything else reads as English.
 */
export const CUSTOMER_LANGUAGES = ['en-IN', 'mr-IN', 'hi-IN'] as const;
export type CustomerLanguage = (typeof CUSTOMER_LANGUAGES)[number];

export const DEFAULT_CUSTOMER_LANGUAGE: CustomerLanguage = 'en-IN';

/** Each language in its own script, the way a language picker shows it. */
export const LANGUAGE_NAMES: Readonly<Record<CustomerLanguage, string>> = {
  'en-IN': 'English',
  'mr-IN': 'मराठी',
  'hi-IN': 'हिंदी',
};

export function isCustomerLanguage(value: unknown): value is CustomerLanguage {
  return typeof value === 'string' && (CUSTOMER_LANGUAGES as readonly string[]).includes(value);
}

/** A stored or requested value ("mr", "mr-IN", "hi_in") as a supported language, else English. */
export function customerLanguage(value: string | null | undefined): CustomerLanguage {
  const base = value?.trim().toLowerCase().split(/[-_]/)[0];
  if (!base) return DEFAULT_CUSTOMER_LANGUAGE;
  return (
    CUSTOMER_LANGUAGES.find((language) => language.startsWith(`${base}-`)) ??
    DEFAULT_CUSTOMER_LANGUAGE
  );
}

/** The language remembered on one phone. `unsaved`: chosen there, not yet on the record. */
export interface PhoneLanguage {
  readonly language: CustomerLanguage;
  readonly unsaved: boolean;
}

export interface LanguageSettlement {
  /** The language the app shows from now on. */
  readonly language: CustomerLanguage;
  /** Save it on the customer record (the phone's choice is newer than the record's). */
  readonly save: boolean;
}

/**
 * Which language the app uses once OneOhm knows who signed in (PRD 5.1):
 * - a choice made on this phone and not saved yet (on the sign-in screen, or while
 *   offline) wins, and is saved on the customer record;
 * - otherwise the record's language, so a new phone opens in it and a change made by
 *   the team reaches the app;
 * - a family member's choice stays on their own phone and never changes the record.
 */
export function settleLanguage(input: {
  readonly phone: PhoneLanguage | null;
  readonly account: CustomerLanguage;
  readonly familyMember: boolean;
}): LanguageSettlement {
  const { phone, account, familyMember } = input;
  if (familyMember) return { language: phone?.language ?? account, save: false };
  if (phone?.unsaved) return { language: phone.language, save: phone.language !== account };
  return { language: account, save: false };
}
