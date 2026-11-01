import { isCustomerLanguage, type PhoneLanguage } from '@oneohm/domain';
import { createTokenStore } from '@oneohm/mobile-ui';
import { setLanguage } from './language';

/** The language remembered on this phone, so the app opens in it before sign-in. */
const store = createTokenStore('oneohm.customer.language');

/** The saved choice, or null when this phone has none (or it cannot be read). */
export async function readPhoneLanguage(): Promise<PhoneLanguage | null> {
  try {
    const saved: unknown = JSON.parse((await store.read()) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return null;
    const { language, unsaved } = saved as Record<string, unknown>;
    return isCustomerLanguage(language) ? { language, unsaved: unsaved === true } : null;
  } catch {
    return null;
  }
}

export async function writePhoneLanguage(choice: PhoneLanguage): Promise<void> {
  try {
    await store.write(JSON.stringify(choice));
  } catch {
    // Not remembered on this phone; the app still speaks it until it closes.
  }
}

/** Read once at launch; the root layout waits for it so the first screen is in the right language. */
export const phoneLanguageReady: Promise<void> = readPhoneLanguage().then((saved) => {
  if (saved) setLanguage(saved.language);
});
