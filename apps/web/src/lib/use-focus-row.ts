'use client';

import { ROW_KEY_ATTRIBUTE, useToast } from '@oneohm/design-system/web';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

/** The highlight `ResponsiveTable` gives the row a link pointed at, for lists drawn by hand. */
export const FOCUSED_ROW = 'bg-accent-soft/60';

/** For lists drawn by hand (not `ResponsiveTable`): the row's key for `scrollToRow`. */
export function focusRowProps(id: string, focused: string | null) {
  return {
    [ROW_KEY_ATTRIBUTE]: id,
    'aria-current': id === focused ? ('true' as const) : undefined,
  };
}

/** Scrolls to the row with this key; a table and its phone cards both carry it, so pick the shown one. */
export function scrollToRow(key: string) {
  const rows = document.querySelectorAll<HTMLElement>(
    `[${ROW_KEY_ATTRIBUTE}="${CSS.escape(key)}"]`,
  );
  const shown = [...rows].find((row) => row.offsetParent !== null);
  shown?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/**
 * Lands a link like `?bill=<id>` on that one row (an approval's or alert's "Open"). Once
 * the list has loaded it marks the row and scrolls to it, then hands the row to `onFound`
 * (to open its sheet). When the row is not there it says the item is no longer waiting.
 * Either way the key leaves the address, so switching tabs or filters does not bring it
 * back. Returns the marked row's id, for the highlight.
 */
export function useFocusRow<T extends { readonly id: string }>(
  key: string,
  rows: readonly T[] | undefined,
  onFound?: (row: T) => void,
): string | null {
  const t = useTranslations('lists.focus');
  const toast = useToast();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const wanted = params.get(key);
  const [focused, setFocused] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  const found = useRef(onFound);
  found.current = onFound;

  useEffect(() => {
    if (!wanted || !rows || handled.current === wanted) return;
    handled.current = wanted;
    const row = rows.find((candidate) => candidate.id === wanted);
    if (row) {
      setFocused(row.id);
      found.current?.(row);
      requestAnimationFrame(() => scrollToRow(row.id));
    } else {
      toast({ title: t('gone'), description: t('goneBody'), tone: 'info' });
    }
    const next = new URLSearchParams(params);
    next.delete(key);
    router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
  }, [wanted, rows, key, params, pathname, router, t, toast]);

  return focused;
}
