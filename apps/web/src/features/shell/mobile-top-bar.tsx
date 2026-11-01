import { Avatar } from '@oneohm/design-system/web';
import { useTranslations } from 'next-intl';
import { BrandLogo } from './brand-logo';

/** Phones: the logo and who is signed in. The full menu arrives with the next screens. */
export function MobileTopBar() {
  const t = useTranslations('nav');
  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-hairline bg-canvas/85 px-4 backdrop-blur md:hidden">
      <BrandLogo alt={t('logoAlt')} className="h-7" />
      <Avatar name={t('account.role')} swatch={1} size="sm" />
    </header>
  );
}
