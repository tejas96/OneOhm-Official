'use client';

import { cn, Tooltip } from '@oneohm/design-system/web';
import { PanelLeft } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { CommandPalette } from '@/features/search/command-palette';
import { AccountMenu } from './account-menu';
import { AlertsBell } from './alerts-bell';
import { BrandLogo } from './brand-logo';
import { NavList } from './nav-list';
import { SearchButton } from './search-button';
import { ThemeSwitch } from './theme-switch';

/** In the dark the sidebar floats as a card; on light paper it sits on the canvas. */
const ASIDE =
  'dark:md:my-2 dark:md:ml-2 dark:md:h-[calc(100dvh-1rem)] dark:md:rounded-2xl dark:md:border dark:md:border-hairline dark:md:bg-raised dark:md:shadow-e1';

const STORAGE_KEY = 'oneohm.sidebar.collapsed';

/** Remembers the choice for the next visit; starts open so the server and browser agree. */
function useCollapsed(): readonly [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      // Storage can be blocked; the sidebar then simply starts open.
    }
  }, []);
  const toggle = () =>
    setCollapsed((current) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, current ? '0' : '1');
      } catch {
        // Not saved; the choice still holds for this visit.
      }
      return !current;
    });
  return [collapsed, toggle];
}

/**
 * Wide screens: the business's map down the left edge. Every row keeps its height
 * (`shrink-0`); when the list is taller than the window, the list scrolls instead
 * of squashing the search box and menu items. The panel button folds it down to
 * icons only.
 *
 * The sidebar is always mounted (hidden on phones), so it also hosts the one
 * "Jump to…" palette that the phone bar and ⌘K open too.
 */
export function Sidebar() {
  const t = useTranslations('nav');
  const [collapsed, toggle] = useCollapsed();
  const toggleLabel = t(collapsed ? 'expand' : 'collapse');
  return (
    <>
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 px-3 py-5 transition-[width] duration-(--duration-fast) md:flex',
          collapsed ? 'w-[4.5rem]' : 'w-64',
          ASIDE,
        )}
      >
        <div className="flex shrink-0 flex-col gap-1.5 px-2">
          <div
            className={cn('flex items-center gap-2', collapsed ? 'flex-col' : 'justify-between')}
          >
            {!collapsed && <BrandLogo alt={t('logoAlt')} className="h-9" />}
            <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
              <Tooltip content={toggleLabel} side={collapsed ? 'right' : 'bottom'}>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-sunken hover:text-ink"
                >
                  <PanelLeft aria-hidden className="size-[1.125rem]" />
                </button>
              </Tooltip>
              <AlertsBell hint={collapsed} />
            </div>
          </div>
        </div>

        <SearchButton compact={collapsed} />

        <NavList
          variant="sidebar"
          collapsed={collapsed}
          className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1"
        />

        <div className="flex shrink-0 flex-col gap-3 border-t border-hairline px-1 pt-4">
          <ThemeSwitch compact={collapsed} />
          <AccountMenu compact={collapsed} />
        </div>
      </aside>
      <CommandPalette />
    </>
  );
}
