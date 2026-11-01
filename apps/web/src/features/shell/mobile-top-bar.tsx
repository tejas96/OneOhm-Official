'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { openSearch } from '@/features/search/search-store';
import { AlertsBell } from './alerts-bell';
import { BrandLogo } from './brand-logo';
import { MobileMenu } from './mobile-menu';

/** Phones: the logo, then search, alerts and the menu within thumb reach. */
export function MobileTopBar() {
  const t = useTranslations('nav');
  const tSearch = useTranslations('search');
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-hairline bg-canvas/85 px-4 backdrop-blur md:hidden">
      <BrandLogo alt={t('logoAlt')} className="h-7" />
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={tSearch('open')}
          aria-haspopup="dialog"
          title={tSearch('open')}
          onClick={openSearch}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-hairline bg-raised text-ink-muted shadow-e1 hover:text-ink"
        >
          <Search aria-hidden className="size-[1.125rem]" />
        </button>
        <AlertsBell />
        <MobileMenu />
      </div>
    </header>
  );
}
