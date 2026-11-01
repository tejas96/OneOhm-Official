'use client';

import { Avatar, Sheet } from '@oneohm/design-system/web';
import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { AccountMenu } from './account-menu';
import { useCompanyName } from './company-name';
import { NavList } from './nav-list';
import { SearchButton } from './search-button';
import { ThemeSwitch } from './theme-switch';

/**
 * Remembers the page the menu was opened on, so it closes by itself whenever the
 * page changes: a menu link, the palette, or the phone's back gesture.
 */
function useOpenOnThisPage() {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  return {
    open: openOn === pathname,
    setOpen: (next: boolean) => setOpenOn(next ? pathname : null),
  };
}

/** Phones: the whole menu in a sheet, opened from the pill with who is signed in. */
export function MobileMenu() {
  const t = useTranslations('nav');
  const companyName = useCompanyName();
  const user = useCurrentUser();
  const { open, setOpen } = useOpenOnThisPage();
  const close = () => setOpen(false);
  return (
    <>
      <button
        type="button"
        aria-label={t('menuOpen')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-hairline bg-raised pr-1 pl-2.5 text-ink-muted shadow-e1 hover:text-ink"
      >
        <Menu aria-hidden className="size-[1.125rem]" />
        <Avatar name={user.fullName} swatch={1} size="sm" />
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={t('menu')}
        description={companyName || undefined}
        footer={
          <div className="flex w-full flex-col gap-3">
            <ThemeSwitch />
            <AccountMenu />
          </div>
        }
      >
        <div className="flex flex-col gap-4 px-3 py-4">
          <SearchButton onOpen={close} showShortcut={false} className="h-11 type-body" />
          <NavList variant="sheet" onNavigate={close} />
        </div>
      </Sheet>
    </>
  );
}
