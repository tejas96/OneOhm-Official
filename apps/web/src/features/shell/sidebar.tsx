'use client';

import { Avatar, CountBadge, cn } from '@oneohm/design-system/web';
import { ChevronsUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BrandLogo } from './brand-logo';
import { NAVIGATION, type NavItem } from './navigation';
import { ThemeSwitch } from './theme-switch';

/** Wide screens: the business's map down the left edge. */
export function Sidebar() {
  const t = useTranslations('nav');
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-5 overflow-y-auto px-3 py-5 md:flex">
      <div className="flex flex-col gap-1.5 px-2">
        <BrandLogo alt={t('logoAlt')} className="h-9" />
        <p className="type-label text-ink-faint">{t('company')}</p>
      </div>

      <button
        type="button"
        className="flex h-10 items-center gap-2 rounded-md border border-hairline bg-raised/70 px-3 type-body-sm text-ink-faint shadow-e1 transition-colors hover:border-rule hover:text-ink-muted"
      >
        <Search aria-hidden className="size-4" />
        <span className="flex-1 text-left">{t('search')}</span>
        <kbd className="rounded-sm border border-hairline px-1.5 font-mono text-[0.6875rem]">
          ⌘K
        </kbd>
      </button>

      <nav aria-label={t('label')} className="flex flex-1 flex-col gap-4">
        {NAVIGATION.map((group, index) => (
          <div key={group.key ?? `group-${index}`} className="flex flex-col gap-0.5">
            {group.key && (
              <p className="px-3 pb-1 type-overline text-ink-faint uppercase">
                {t(`groups.${group.key}`)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.key}>
                  <NavLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex flex-col gap-3 border-t border-hairline px-1 pt-4">
        <ThemeSwitch />
        <button
          type="button"
          className="flex items-center gap-3 rounded-md p-2 text-left transition-colors hover:bg-sunken"
        >
          <Avatar name={t('account.role')} swatch={1} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate type-body-sm font-medium text-ink">{t('account.role')}</span>
            <span className="truncate type-label text-ink-faint">{t('account.preview')}</span>
          </span>
          <ChevronsUpDown aria-hidden className="size-4 text-ink-faint" />
        </button>
      </div>
    </aside>
  );
}

const LEADS_TO_FOLLOW_UP = 11;

function NavLink({ item }: { readonly item: NavItem }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  const content = (
    <>
      {active && (
        <span
          aria-hidden
          className="oh-brand-line absolute inset-y-2 left-0 w-[3px] rounded-full"
        />
      )}
      <Icon
        aria-hidden
        className={cn('size-[1.125rem]', active ? 'text-accent' : 'text-ink-faint')}
      />
      <span className="flex-1">{t(`items.${item.key}`)}</span>
      {item.key === 'leads' && (
        <CountBadge
          count={LEADS_TO_FOLLOW_UP}
          label={t('leadsBadge', { count: LEADS_TO_FOLLOW_UP })}
        />
      )}
    </>
  );
  const classes = cn(
    'relative flex h-9 items-center gap-3 rounded-md px-3 type-body-sm transition-colors duration-(--duration-fast)',
    active
      ? 'bg-raised font-medium text-ink shadow-e1'
      : 'text-ink-muted hover:bg-sunken hover:text-ink',
  );
  if (!item.built) {
    return (
      <span aria-disabled="true" title={t('notBuilt')} className={cn(classes, 'cursor-default')}>
        {content}
      </span>
    );
  }
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={classes}>
      {content}
    </Link>
  );
}
