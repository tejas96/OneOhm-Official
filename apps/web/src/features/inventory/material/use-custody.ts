'use client';

import type { CustodyHolding } from '@oneohm/api-contracts';
import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { INVENTORY_KEYS } from '../use-inventory';

/** Under the inventory keys, so every stock change refreshes these too. */
export const CUSTODY_KEYS = {
  project: (projectId: string) => [...INVENTORY_KEYS.all, 'custody', projectId] as const,
  contractor: (contractorId: string) =>
    [...INVENTORY_KEYS.all, 'custody', 'contractor', contractorId] as const,
};

export function useProjectCustody(projectId: string | null) {
  return useQuery({
    queryKey: CUSTODY_KEYS.project(projectId ?? 'none'),
    queryFn: () =>
      expectStatus(api.inventory.custody.project({ params: { id: projectId ?? '' } }), 200),
    enabled: projectId !== null,
  });
}

export function useContractorMaterial(contractorId: string, enabled: boolean) {
  return useQuery({
    queryKey: CUSTODY_KEYS.contractor(contractorId),
    queryFn: () =>
      expectStatus(api.inventory.custody.contractor({ params: { id: contractorId } }), 200),
    enabled,
  });
}

/** Nothing left with the contractor (float noise aside). */
export const settled = (holding: Pick<CustodyHolding, 'balance'>) =>
  Math.abs(holding.balance) < 0.0005;
