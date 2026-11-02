'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

export const ROOM_TABS = [
  'overview',
  'tasks',
  'payments',
  'material',
  'documents',
  'reports',
  'activity',
] as const;
export type RoomTab = (typeof ROOM_TABS)[number];

export const TASK_LAYOUTS = ['board', 'list', 'kanban'] as const;
export type TaskLayout = (typeof TASK_LAYOUTS)[number];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.find((candidate) => candidate === value) ?? fallback;
}

/**
 * The open tab (`?tab=`) and the task layout (`?layout=list`) live in the URL, so a
 * link or a refresh opens the room where it was left. Changes replace the entry and
 * keep the scroll position, like the finance and settings tabs.
 */
export function useRoomTab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = pick<RoomTab>(params.get('tab'), ROOM_TABS, 'overview');
  const layout = pick<TaskLayout>(params.get('layout'), TASK_LAYOUTS, 'board');

  const hrefFor = useCallback(
    (next: RoomTab) => {
      const query = new URLSearchParams(params);
      query.set('tab', next);
      return `${pathname}?${query.toString()}`;
    },
    [params, pathname],
  );

  const select = useCallback(
    (next: RoomTab) => router.replace(hrefFor(next), { scroll: false }),
    [hrefFor, router],
  );

  const setLayout = useCallback(
    (next: TaskLayout) => {
      const query = new URLSearchParams(params);
      if (next === 'board') query.delete('layout');
      else query.set('layout', next);
      const suffix = query.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { tab, select, hrefFor, layout, setLayout };
}
