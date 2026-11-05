'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * One choice from a fixed list kept in the address (a list's status filter), so a link can
 * open the list already filtered. The fallback stays out of the address.
 */
export function useChoiceParam<T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): readonly [T, (next: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const asked = params.get(key);
  const value = values.find((candidate) => candidate === asked) ?? fallback;
  const set = (next: T) => {
    const search = new URLSearchParams(params);
    if (next === fallback) search.delete(key);
    else search.set(key, next);
    router.replace(`${pathname}${search.size ? `?${search.toString()}` : ''}`, { scroll: false });
  };
  return [value, set];
}
