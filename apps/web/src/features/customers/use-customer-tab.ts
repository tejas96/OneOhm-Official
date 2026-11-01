'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';

export const CUSTOMER_TABS = [
  'overview',
  'money',
  'conversations',
  'service',
  'documents',
] as const;
export type CustomerTab = (typeof CUSTOMER_TABS)[number];

/**
 * The open section of the customer page lives in `?tab=`, so a link or a refresh opens
 * it again. Changes replace the history entry and keep the scroll position.
 */
export function useCustomerTab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const tab = CUSTOMER_TABS.find((value) => value === params.get('tab')) ?? 'overview';

  const select = useCallback(
    (next: CustomerTab) => {
      const query = new URLSearchParams(params);
      if (next === 'overview') query.delete('tab');
      else query.set('tab', next);
      const suffix = query.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { tab, select };
}

/** Money, conversations, change requests, service, feedback and referrals in one read. */
export function useCustomerActivity(customerId: string) {
  return useQuery({
    queryKey: ['customers', 'activity', customerId],
    queryFn: () => expectStatus(api.crm.getCustomerActivity({ params: { id: customerId } }), 200),
  });
}
