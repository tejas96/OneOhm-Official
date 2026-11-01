'use client';

import { CountBadge, cn } from '@oneohm/design-system/web';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCurrentUser } from '@/providers/current-user';
import { AccountMenu } from './account-menu';
import { BrandLogo } from './brand-logo';
import { NAVIGATION, type NavItem } from './navigation';
import { ThemeSwitch } from './theme-switch';

/**
 * One look in both themes, as chosen: on light paper the current page is a solid
 * ink pill; in the dark the sidebar floats as a card and the current page is a soft
 * Ohm-blue wash.
 */
const STYLES = {
  aside:
    'dark:md:my-2 dark:md:ml-2 dark:md:h-[calc(100dvh-1rem)] dark:md:rounded-2xl dark:md:border dark:md:border-hairline dark:md:bg-raised dark:md:shadow-e1',
  muted: 'text-ink-faint',
  search:
    'border-hairline bg-raised/70 text-ink-faint shadow-e1 hover:border-rule hover:text-ink-muted dark:bg-surface',
  item: 'text-ink-muted hover:bg-sunken/70 hover:text-ink',
  itemActive:
    'bg-ink font-medium text-canvas shadow-e2 dark:bg-accent-soft dark:text-on-accent-soft dark:shadow-none',
  icon: 'text-ink-faint',
  iconActive: 'text-canvas dark:text-accent',
} as const;

/**
 * Wide screens: the business's map down the left edge. Every row keeps its height
 * (`shrink-0`); when the list is taller than the window, the list scrolls instead
 * of squashing the search box and menu items.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const styles = STYLES;
  const user = useCurrentUser();
  const allowed = (item: NavItem) =>
    !item.requires || item.requires.some((capability) => user.capabilities.includes(capability));
  const groups = NAVIGATION.map((group) => ({
    ...group,
    items: group.items.filter(allowed),
  })).filter((group) => group.items.length > 0);
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
        {groups.map((group, index) => (
          <div key={group.key ?? `group-${index}`} className="flex shrink-0 flex-col gap-0.5">
            {group.key && (
              <p className="px-3 pb-0.5 type-overline text-ink-faint uppercase">
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

      <div className="flex shrink-0 flex-col gap-3 border-t border-hairline px-1 pt-4">
        <ThemeSwitch />
        <AccountMenu />
      </div>
    </aside>
  );
}

/** Leads whose next action is due: the one number worth a badge in the menu. */
function useLeadsToFollowUp(enabled: boolean): number {
  const { data } = useQuery({
    queryKey: ['leads', 'open'],
    queryFn: () => expectStatus(api.crm.listLeads({ query: { open: true } }), 200),
    enabled,
    staleTime: 60_000,
  });
  return (
    data?.filter(
      (lead) => lead.overdue || lead.nextActionOn === new Date().toISOString().slice(0, 10),
    ).length ?? 0
  );
}

function NavLink({ item }: { readonly item: NavItem }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const styles = STYLES;
  const followUps = useLeadsToFollowUp(item.key === 'leads');
  const href = item.href;
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
        <CountBadge count={followUps} label={t('leadsBadge', { count: followUps })} />
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
