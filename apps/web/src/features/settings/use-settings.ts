'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const SETTINGS_KEYS = {
  company: ['settings', 'company'],
  products: ['settings', 'products'],
  rateCard: ['settings', 'rate-card'],
  discoms: ['discoms'],
  subsidyRules: ['settings', 'subsidy-rules'],
} as const;

export function useCompany() {
  return useQuery({
    queryKey: SETTINGS_KEYS.company,
    queryFn: () => expectStatus(api.catalog.getCompany(), 200),
  });
}

/** Every product, archived ones included (Settings only). */
export function useAllProducts() {
  return useQuery({
    queryKey: SETTINGS_KEYS.products,
    queryFn: () =>
      expectStatus(api.catalog.listProducts({ query: { includeInactive: true } }), 200),
  });
}

export function useRateCard() {
  return useQuery({
    queryKey: SETTINGS_KEYS.rateCard,
    queryFn: () => expectStatus(api.catalog.getRateCard(), 200),
  });
}

export function useDiscoms() {
  return useQuery({
    queryKey: SETTINGS_KEYS.discoms,
    queryFn: () => expectStatus(api.catalog.listDiscoms(), 200),
  });
}

export function useSubsidyRules() {
  return useQuery({
    queryKey: SETTINGS_KEYS.subsidyRules,
    queryFn: () => expectStatus(api.catalog.listSubsidyRules(), 200),
    staleTime: 5 * 60_000,
  });
}
