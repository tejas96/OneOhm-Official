'use client';

import type { Bonus, BonusInput } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const BONUSES_KEY = ['bonuses'] as const;

/**
 * Bonuses in one status (or all), newest first. The server holds back all but the newest
 * few hundred, so asking by status keeps an old pending bonus in the list.
 */
export function useBonuses(status: 'all' | Bonus['status']) {
  return useQuery({
    queryKey: [...BONUSES_KEY, status],
    queryFn: () =>
      expectStatus(api.engagement.listBonuses({ query: status === 'all' ? {} : { status } }), 200),
  });
}

/** Projects to tie a bonus to (optional), loaded only while the sheet is open. */
export function useBonusProjects(enabled: boolean) {
  return useQuery({
    queryKey: ['projects', 'all'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
    enabled,
    retry: false,
  });
}

/** Propose, decide and withdraw; each refreshes the list (and people, whose money changed). */
export function useBonusActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: BONUSES_KEY }),
    [queryClient],
  );
  return {
    propose: async (body: BonusInput) => {
      const created = await expectStatus(api.engagement.proposeBonus({ body }), 201);
      await refresh();
      return created;
    },
    decide: async (id: string, approve: boolean, note: string | null) => {
      const decided = await expectStatus(
        api.engagement.decideBonus({ params: { id }, body: { approve, note } }),
        200,
      );
      await refresh();
      return decided;
    },
    cancel: async (id: string) => {
      const cancelled = await expectStatus(api.engagement.cancelBonus({ params: { id } }), 200);
      await refresh();
      return cancelled;
    },
  };
}
