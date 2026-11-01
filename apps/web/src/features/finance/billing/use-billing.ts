'use client';

import { useQuery } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';
import { FINANCE_KEY } from '../use-finance';

/**
 * Invoices, customer credit and refunds. Keys sit under FINANCE_KEY, so every money
 * change (useInvalidateFinance) refreshes them along with the rest of finance.
 */
export const projectBillingKey = (projectId: string) =>
  [...FINANCE_KEY, 'billing', projectId] as const;

export const useProjectBilling = (projectId: string, enabled = true) =>
  useQuery({
    queryKey: projectBillingKey(projectId),
    queryFn: () => expectStatus(api.billing.projectBilling({ params: { projectId } }), 200),
    enabled,
  });

export const useInvoices = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'invoices'],
    queryFn: () => expectStatus(api.billing.listInvoices({ query: { limit: 200 } }), 200),
  });

export const useCustomerMoney = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'customer-money'],
    queryFn: () => expectStatus(api.billing.listCustomerMoney({ query: { limit: 50 } }), 200),
  });

/** The invoice PDF through the web app's API proxy, opened in a new tab. */
export const invoicePdfHref = (id: string) =>
  `/api/v1/finance/invoices/${id}/pdf?disposition=inline`;
