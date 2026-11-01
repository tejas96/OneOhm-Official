import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';

/** Query keys for the reseller's own book, kept with the feature. */
export const resellerKeys = {
  customers: ['reseller', 'customers'] as const,
  earnings: ['reseller', 'earnings'] as const,
};

export function useMyCustomers() {
  return useQuery({
    queryKey: resellerKeys.customers,
    queryFn: () => unwrap(api.commissions.myCustomers()),
  });
}

export function useMyEarnings() {
  return useQuery({
    queryKey: resellerKeys.earnings,
    queryFn: () => unwrap(api.commissions.myEarnings()),
  });
}

/** 300 basis points reads "3", 325 reads "3.25". */
export function percentOf(bp: number): string {
  return (bp / 100).toFixed(2).replace(/\.?0+$/, '');
}

/** 3270 Wp reads "3.27". */
export function kwOf(wp: number): string {
  return (wp / 1000).toFixed(2).replace(/\.?0+$/, '');
}
