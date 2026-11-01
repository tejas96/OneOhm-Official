import type { CustomerHome, CustomerProfile } from '@oneohm/api-contracts';
import { type CustomerLanguage, settleLanguage } from '@oneohm/domain';
import { unwrap } from '@oneohm/mobile-ui';
import { api, keys, queryClient } from '@/api/api';
import { currentLanguage, setLanguage } from './language';
import { phoneLanguageReady, readPhoneLanguage, writePhoneLanguage } from './phone-language';

/**
 * Once OneOhm says who signed in (sign-in, or each launch): use the language saved on the
 * customer record, unless this phone holds a newer choice, which is then saved there.
 */
export async function settleWithAccount(customer: CustomerProfile): Promise<void> {
  await phoneLanguageReady;
  const familyMember = Boolean(customer.viewer);
  const settled = settleLanguage({
    phone: await readPhoneLanguage(),
    account: customer.language,
    familyMember,
  });
  setLanguage(settled.language);
  await writePhoneLanguage({ language: settled.language, unsaved: settled.save });
  if (settled.save) void saveToAccount(settled.language);
}

/** Picked on the sign-in screen: remembered here, saved on the record at sign-in. */
export async function chooseBeforeSignIn(language: CustomerLanguage): Promise<void> {
  setLanguage(language);
  await writePhoneLanguage({ language, unsaved: true });
}

/**
 * Picked in Me: the app switches at once; the customer record follows when OneOhm
 * answers. A family member's choice stays on their phone. Resolves false when it could
 * not be saved yet (it is saved at the next launch).
 */
export async function chooseSignedIn(
  language: CustomerLanguage,
  familyMember: boolean,
): Promise<boolean> {
  setLanguage(language);
  await writePhoneLanguage({ language, unsaved: !familyMember });
  return familyMember ? true : saveToAccount(language);
}

async function saveToAccount(language: CustomerLanguage): Promise<boolean> {
  try {
    await unwrap(api.customerAppLanguage.setMyLanguage({ body: { language } }));
  } catch {
    return false;
  }
  // A quicker second change wins; this answer must not mark that one as saved.
  if (currentLanguage() !== language) return true;
  await writePhoneLanguage({ language, unsaved: false });
  queryClient.setQueryData<CustomerHome>(keys.home, (home) =>
    home ? { ...home, customer: { ...home.customer, language } } : home,
  );
  return true;
}
