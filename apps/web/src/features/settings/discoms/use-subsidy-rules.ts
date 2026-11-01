'use client';

import type { SubsidyRuleInput, SubsidyRuleVersion } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { SETTINGS_KEYS } from '../use-settings';

const IMPACT_KEY = ['settings', 'subsidy-impact'] as const;

/**
 * Saving or withdrawing a version: the list and every impact answer are stale after it.
 * Resolves to the saved version (null after a withdrawal).
 */
export function useSubsidyRuleActions() {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: SETTINGS_KEYS.subsidyRules });
    await queryClient.invalidateQueries({ queryKey: IMPACT_KEY });
  }, [queryClient]);

  const save = useCallback(
    async (id: string | null, body: SubsidyRuleInput): Promise<SubsidyRuleVersion> => {
      const saved = id
        ? await expectStatus(api.catalog.updateSubsidyRule({ params: { id }, body }), 200)
        : await expectStatus(api.catalog.createSubsidyRule({ body }), 201);
      await refresh();
      return saved;
    },
    [refresh],
  );

  const withdraw = useCallback(
    async (id: string): Promise<null> => {
      await expectStatus(api.catalog.deleteSubsidyRule({ params: { id } }), 204);
      await refresh();
      return null;
    },
    [refresh],
  );

  return { save, withdraw };
}

/** Open quotations whose expected subsidy differs under the rules in force on `asOf`. */
export function useSubsidyImpact(asOf: string | null) {
  return useQuery({
    queryKey: [...IMPACT_KEY, asOf],
    queryFn: () =>
      expectStatus(api.catalog.subsidyRuleImpact({ query: asOf ? { asOf } : {} }), 200),
    enabled: asOf !== null,
    staleTime: 0,
  });
}
