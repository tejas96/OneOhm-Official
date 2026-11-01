'use client';

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { useCurrentUser } from '@/providers/current-user';
import { NAVIGATION, type NavGroup, type NavItem } from './navigation';

/** The menu this person may see: items they hold a capability for, empty groups dropped. */
export function useAllowedNavigation(): readonly NavGroup[] {
  const user = useCurrentUser();
  return useMemo(() => {
    const allowed = (item: NavItem) =>
      !item.requires || item.requires.some((capability) => user.capabilities.includes(capability));
    return NAVIGATION.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter(
      (group) => group.items.length > 0,
    );
  }, [user.capabilities]);
}

/** Whether a menu entry owns the current page (its own path or anything under it). */
export function useIsCurrent(href: string): boolean {
  const pathname = usePathname();
  return pathname === href || pathname.startsWith(`${href}/`);
}
