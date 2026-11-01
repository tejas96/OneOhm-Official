import { DARK_COLORS, LIGHT_COLORS } from '@oneohm/design-system/tokens';
import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { DEFAULT_LOCALE, isSupportedLocale } from '@/i18n/config';
import { AppProviders } from '@/providers/app-providers';
import {
  MOTION_COOKIE,
  parseCalmMotion,
  parseThemePreference,
  THEME_COOKIE,
} from '@/providers/preferences';
import { displayFace, monoFace, uiFace } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'OneOhm', template: '%s · OneOhm' },
  description: 'Leads, quotations, projects, field work and payments for OneOhm, in one place.',
  robots: { index: false, follow: false },
  icons: { icon: '/brand/oneohm-mark.webp' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: LIGHT_COLORS.canvas },
    { media: '(prefers-color-scheme: dark)', color: DARK_COLORS.canvas },
  ],
};

export default async function RootLayout({ children }: { readonly children: ReactNode }) {
  const store = await cookies();
  const locale = await getLocale();
  const theme = parseThemePreference(store.get(THEME_COOKIE)?.value);
  const calmMotion = parseCalmMotion(store.get(MOTION_COOKIE)?.value);
  return (
    <html
      lang={isSupportedLocale(locale) ? locale : DEFAULT_LOCALE}
      data-theme={theme === 'system' ? undefined : theme}
      data-motion={calmMotion ? 'calm' : undefined}
      className={`${displayFace.variable} ${uiFace.variable} ${monoFace.variable}`}
      suppressHydrationWarning
    >
      <body>
        <NextIntlClientProvider>
          <AppProviders initialTheme={theme} initialCalmMotion={calmMotion}>
            {children}
          </AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
