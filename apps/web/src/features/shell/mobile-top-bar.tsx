'use client';

import { Avatar } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/providers/current-user';
import { AlertsBell } from './alerts-bell';
import { BrandLogo } from './brand-logo';

/** Phones: the logo and who is signed in. The full menu arrives with the next screens. */
export function MobileTopBar() {
  const t = useTranslations('nav');
  const user = useCurrentUser();
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-hairline bg-canvas/85 px-4 backdrop-blur md:hidden">
      <BrandLogo alt={t('logoAlt')} className="h-7" />
      <div className="flex items-center gap-3">
        <AlertsBell />
        <Avatar name={user.fullName} swatch={1} size="sm" />
      </div>
    </header>
  );
}
