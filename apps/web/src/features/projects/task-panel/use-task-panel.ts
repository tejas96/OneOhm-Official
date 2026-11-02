'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { TASK_PARAM, withTask } from './task-panel-url';

export const taskKey = (id: string) => ['tasks', 'detail', id] as const;

/**
 * The open task lives in the URL (`?task=`), so any list can open the panel, a link can
 * be shared, and a refresh keeps it open. Changes replace the entry and keep the scroll.
 */
export function useTaskPanel() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const taskId = params.get(TASK_PARAM);

  const go = useCallback(
    (id: string | null) =>
      router.replace(`${pathname}${withTask(params.toString(), id)}`, { scroll: false }),
    [params, pathname, router],
  );
  const open = useCallback((id: string) => go(id), [go]);
  const close = useCallback(() => go(null), [go]);

  return { taskId, open, close };
}
