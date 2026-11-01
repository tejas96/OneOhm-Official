'use client';

import type { StateSubsidyInput, StateSubsidyVersion } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const STATE_RULES_KEY = ['settings', 'state-subsidy-rules'] as const;

/** The state top-up's versions, newest first (PRD 3.5). */
export function useStateRules() {
  return useQuery({
    queryKey: STATE_RULES_KEY,
    queryFn: () => expectStatus(api.stateSupport.listStateRules(), 200),
    staleTime: 5 * 60_000,
  });
}

/** Saving or withdrawing a version; live quotation prices are stale after it. */
export function useStateRuleActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: STATE_RULES_KEY });
    await queryClient.invalidateQueries({ queryKey: ['quotation-preview'] });
  }, [queryClient]);

  const save = useCallback(
    async (id: string | null, body: StateSubsidyInput): Promise<StateSubsidyVersion> => {
      const saved = id
        ? await expectStatus(api.stateSupport.updateStateRule({ params: { id }, body }), 200)
        : await expectStatus(api.stateSupport.createStateRule({ body }), 201);
      await refresh();
      return saved;
    },
    [refresh],
  );

  const withdraw = useCallback(
    async (id: string) => {
      await expectStatus(api.stateSupport.deleteStateRule({ params: { id } }), 204);
      await refresh();
    },
    [refresh],
  );

  return { save, withdraw };
}
