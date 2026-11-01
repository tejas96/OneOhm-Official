'use client';

import { COMMAND_CENTER_PERIODS, type CommandCenterQuery } from '@oneohm/api-contracts';
import { PROJECT_TYPES } from '@oneohm/domain';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type Period = (typeof COMMAND_CENTER_PERIODS)[number];
export type ProjectType = (typeof PROJECT_TYPES)[number];

const isPeriod = (value: string | null): value is Period =>
  (COMMAND_CENTER_PERIODS as readonly string[]).includes(value ?? '');
const isType = (value: string | null): value is ProjectType =>
  (PROJECT_TYPES as readonly string[]).includes(value ?? '');

/** The command centre's filters, kept in the address so a view can be shared or reloaded. */
export function useCenterFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const period = params.get('period');
  const type = params.get('type');
  const query: CommandCenterQuery = {
    period: isPeriod(period) ? period : 'this_month',
    ...(params.get('manager') ? { managerUserId: params.get('manager') ?? '' } : {}),
    ...(isType(type) ? { projectType: type } : {}),
  };
  const set = (key: 'period' | 'manager' | 'type', value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  const active = Number(Boolean(query.managerUserId)) + Number(Boolean(query.projectType));
  return {
    query,
    active,
    setPeriod: (value: Period) => set('period', value === 'this_month' ? null : value),
    setManager: (value: string | null) => set('manager', value),
    setType: (value: ProjectType | null) => set('type', value),
    clear: () => router.replace(pathname, { scroll: false }),
  };
}
