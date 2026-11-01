import { unwrap } from '@oneohm/mobile-ui';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/api';

export const BILLING_KEY = ['customer', 'billing'] as const;

/** The customer's tax invoices, receipts, refunds and credit, project by project. */
export function useBilling() {
  return useQuery({
    queryKey: BILLING_KEY,
    queryFn: () => unwrap(api.customerBilling.billing()),
  });
}
