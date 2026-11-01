'use client';

import {
  COMMAND_CENTER_PERIODS,
  TASK_BOARD_VIEWS,
  type TaskBoardQuery,
  type TaskBoardView,
} from '@oneohm/api-contracts';
import { PROJECT_TYPES, WAITING_PARTIES } from '@oneohm/domain';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const pick = <T extends string>(allowed: readonly T[], value: string | null): T | undefined =>
  allowed.find((candidate) => candidate === value);

/** Narrowing filters a link can set, each shown as a removable chip. */
export const NARROWING = ['manager', 'type', 'project', 'assignee', 'contractor'] as const;
export type Narrowing = (typeof NARROWING)[number];

/**
 * The task list's filters live in the address, with the same names as the command
 * centre (`period`, `manager`, `type`), so every count links straight here.
 */
export function useTaskBoardFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = (key: string) => params.get(key) ?? undefined;
  const show: TaskBoardView = pick(TASK_BOARD_VIEWS, params.get('show')) ?? 'open';
  const query: TaskBoardQuery = {
    show,
    period: pick(COMMAND_CENTER_PERIODS, params.get('period')) ?? 'this_month',
    ...(value('manager') ? { managerUserId: value('manager') } : {}),
    ...(pick(PROJECT_TYPES, params.get('type'))
      ? { projectType: pick(PROJECT_TYPES, params.get('type')) }
      : {}),
    ...(value('project') ? { projectId: value('project') } : {}),
    ...(value('assignee') ? { assigneeUserId: value('assignee') } : {}),
    ...(value('contractor') ? { contractorId: value('contractor') } : {}),
    ...(pick(WAITING_PARTIES, params.get('party'))
      ? { party: pick(WAITING_PARTIES, params.get('party')) }
      : {}),
  };
  const set = (key: string, next: string | null) => {
    const search = new URLSearchParams(params);
    if (next) search.set(key, next);
    else search.delete(key);
    const suffix = search.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };
  return {
    query,
    narrowing: NARROWING.filter((key) => params.get(key)),
    narrowingValue: (key: Narrowing) => params.get(key) ?? '',
    set,
  };
}
