'use client';

import { Avatar, CountBadge, cn } from '@oneohm/design-system/web';
import { ChevronsUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BrandLogo } from './brand-logo';
import { NAVIGATION, type NavItem } from './navigation';
import { SIDEBAR_LOOKS, type SidebarLook } from './sidebar-looks';
import { ThemeSwitch } from './theme-switch';

interface SidebarProps {
  readonly look?: SidebarLook;
  /** Where links point, so the design lab can keep visitors inside the variant they chose. */
  readonly activeHref?: string;
}

/**
 * Wide screens: the business's map down the left edge. Every row keeps its height
 * (`shrink-0`); when the list is taller than the window, the list scrolls instead
 * of squashing the search box and menu items.
 */
export function Sidebar({ look = 'ink', activeHref }: SidebarProps) {
  const t = useTranslations('nav');
  const styles = SIDEBAR_LOOKS[look];
  return (
    <aside
      className={cn(
        'sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 px-3 py-5 md:flex',
        styles.aside,
      )}
    >
      <div className="flex shrink-0 flex-col gap-1.5 px-2">
        <BrandLogo alt={t('logoAlt')} className="h-9" />
        <p className={cn('type-label', styles.muted)}>{t('company')}</p>
      </div>

      <button
        type="button"
        className={cn(
          'flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 type-body-sm transition-colors',
          styles.search,
        )}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="flex-1 text-left">{t('search')}</span>
        <kbd className="rounded-sm border border-current/20 px-1.5 font-mono text-[0.6875rem]">
          ⌘K
        </kbd>
      </button>

      <nav
        aria-label={t('label')}
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1"
      >
        {NAVIGATION.map((group, index) => (
          <div key={group.key ?? `group-${index}`} className="flex shrink-0 flex-col gap-0.5">
            {group.key && (
              <p className={cn('px-3 pb-0.5 type-overline uppercase', styles.group)}>
                {t(`groups.${group.key}`)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.key}>
                  <NavLink item={item} look={look} activeHref={activeHref} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className={cn('flex shrink-0 flex-col gap-3 border-t px-1 pt-4', styles.divider)}>
        <ThemeSwitch onPanel={look === 'glow'} />
        <button
          type="button"
          className={cn(
            'flex items-center gap-3 rounded-lg p-2 text-left transition-colors',
            styles.account,
          )}
        >
          <Avatar name={t('account.role')} swatch={1} size="sm" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span
              className={cn(
                'truncate type-body-sm font-medium',
                look === 'glow' ? 'text-on-panel' : 'text-ink',
              )}
            >
              {t('account.role')}
            </span>
            <span className={cn('truncate type-label', styles.muted)}>{t('account.preview')}</span>
          </span>
          <ChevronsUpDown aria-hidden className={cn('size-4', styles.muted)} />
        </button>
      </div>
    </aside>
  );
}

const LEADS_TO_FOLLOW_UP = 11;

function NavLink({
  item,
  look,
  activeHref,
}: {
  readonly item: NavItem;
  readonly look: SidebarLook;
  readonly activeHref: string | undefined;
}) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const styles = SIDEBAR_LOOKS[look];
  const href = item.key === 'commandCenter' && activeHref ? activeHref : item.href;
  const active = pathname === href || pathname.startsWith(`${href}/`);
  const Icon = item.icon;
  const content = (
    <>
      <Icon
        aria-hidden
        className={cn('size-[1.125rem] shrink-0', active ? styles.iconActive : styles.icon)}
      />
      <span className="flex-1 truncate">{t(`items.${item.key}`)}</span>
      {item.key === 'leads' && (
        <CountBadge
          count={LEADS_TO_FOLLOW_UP}
          label={t('leadsBadge', { count: LEADS_TO_FOLLOW_UP })}
        />
      )}
    </>
  );
  const classes = cn(
    'relative flex h-[2.125rem] shrink-0 items-center gap-3 rounded-lg px-3 type-body-sm transition-[background-color,color,box-shadow] duration-(--duration-fast)',
    active ? styles.itemActive : styles.item,
  );
  if (!item.built) {
    return (
      <span aria-disabled="true" title={t('notBuilt')} className={cn(classes, 'cursor-default')}>
        {content}
      </span>
    );
  }
  return (
    <Link href={href} aria-current={active ? 'page' : undefined} className={classes}>
      {content}
    </Link>
  );
}
