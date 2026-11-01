'use client';

import { cn } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { CommandPalette } from '@/features/search/command-palette';
import { AccountMenu } from './account-menu';
import { AlertsBell } from './alerts-bell';
import { BrandLogo } from './brand-logo';
import { useCompanyName } from './company-name';
import { NavList } from './nav-list';
import { SearchButton } from './search-button';
import { ThemeSwitch } from './theme-switch';

/** In the dark the sidebar floats as a card; on light paper it sits on the canvas. */
const ASIDE =
  'dark:md:my-2 dark:md:ml-2 dark:md:h-[calc(100dvh-1rem)] dark:md:rounded-2xl dark:md:border dark:md:border-hairline dark:md:bg-raised dark:md:shadow-e1';

/**
 * Wide screens: the business's map down the left edge. Every row keeps its height
 * (`shrink-0`); when the list is taller than the window, the list scrolls instead
 * of squashing the search box and menu items.
 *
 * The sidebar is always mounted (hidden on phones), so it also hosts the one
 * "Jump to…" palette that the phone bar and ⌘K open too.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const companyName = useCompanyName();
  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 px-3 py-5 md:flex',
          ASIDE,
        )}
      >
        <div className="flex shrink-0 flex-col gap-1.5 px-2">
          <div className="flex items-center justify-between gap-2">
            <BrandLogo alt={t('logoAlt')} className="h-9" />
            <AlertsBell />
          </div>
          <p className="type-label text-ink-faint">{companyName}</p>
        </div>

        <SearchButton />

        <NavList variant="sidebar" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1" />

        <div className="flex shrink-0 flex-col gap-3 border-t border-hairline px-1 pt-4">
          <ThemeSwitch />
          <AccountMenu />
        </div>
      </aside>
      <CommandPalette />
    </>
  );
}
