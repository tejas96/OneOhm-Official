import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE } from './config';

/** The reader's language comes from their saved preference (a cookie), not the URL. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const requested = store.get(LOCALE_COOKIE)?.value;
  const locale = requested && isSupportedLocale(requested) ? requested : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}/index.ts`)).default;
  return { locale, messages, timeZone: 'Asia/Kolkata' };
});
