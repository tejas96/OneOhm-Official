import type { PayoutDetailsInput } from '@oneohm/api-contracts';
import { unwrap } from '@oneohm/mobile-ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/api';

/** Query keys for the reseller's own book, kept with the feature. */
export const resellerKeys = {
  customers: ['reseller', 'customers'] as const,
  earnings: ['reseller', 'earnings'] as const,
  payoutDetails: ['reseller', 'payout-details'] as const,
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

/** The signed-in reseller's own payout details; account number and PAN come back masked. */
export function usePayoutDetails(userId: string) {
  return useQuery({
    queryKey: resellerKeys.payoutDetails,
    queryFn: () => unwrap(api.commissions.payoutDetails({ params: { id: userId } })),
  });
}

/** Saves them and shows the saved (masked) version straight away. */
export function useSavePayoutDetails(userId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: PayoutDetailsInput) =>
      unwrap(api.commissions.savePayoutDetails({ params: { id: userId }, body })),
    onSuccess: (saved) => client.setQueryData(resellerKeys.payoutDetails, saved),
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
