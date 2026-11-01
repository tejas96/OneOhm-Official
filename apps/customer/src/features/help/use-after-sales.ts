import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';

export const AFTER_SALES_KEYS = {
  cover: ['customer', 'after-sales'] as const,
  categories: ['customer', 'service-categories'] as const,
};

/** Warranties, the AMC and planned visits for every home. */
export function useCover() {
  return useQuery({
    queryKey: AFTER_SALES_KEYS.cover,
    queryFn: () => unwrap(api.customerAfterSales.cover()),
  });
}

/** The kinds of problem the customer can pick, in plain words, from Settings. */
export function useServiceCategories() {
  return useQuery({
    queryKey: AFTER_SALES_KEYS.categories,
    queryFn: () => unwrap(api.customerAfterSales.serviceCategories()),
    staleTime: 10 * 60_000,
  });
}
