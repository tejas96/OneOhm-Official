'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * A list's search box, kept in `?q=` so a searched list can be reloaded and shared. Returns
 * what the box shows (changes on every key) and the settled search (after a short pause).
 */
export function useSearchParam(key = 'q') {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const applied = params.get(key) ?? '';
  const [draft, setDraft] = useState(applied);

  useEffect(() => {
    if (draft.trim() === applied) return;
    const timer = window.setTimeout(() => {
      const next = new URLSearchParams(params);
      if (draft.trim()) next.set(key, draft.trim());
      else next.delete(key);
      router.replace(`${pathname}${next.size ? `?${next.toString()}` : ''}`, { scroll: false });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [draft, applied, key, params, pathname, router]);

  return { draft, setDraft, search: applied };
}

/** True when any of the values holds every word of the search, ignoring case. */
export function matchesSearch(
  search: string,
  values: readonly (string | null | undefined)[],
): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = values.filter(Boolean).join(' ').toLowerCase();
  return words.every((word) => text.includes(word));
}
