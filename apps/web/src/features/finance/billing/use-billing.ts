'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
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

/** How many invoices one look shows; a search reaches older ones on the server. */
export const INVOICE_LIMIT = 200;

export const useInvoices = (q: string, status: 'issued' | 'cancelled' | undefined) =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'invoices', { q, status }],
    queryFn: () =>
      expectStatus(
        api.billing.listInvoices({
          query: { limit: INVOICE_LIMIT, ...(q ? { q } : {}), ...(status ? { status } : {}) },
        }),
        200,
      ),
    placeholderData: keepPreviousData,
  });

export const useCustomerMoney = () =>
  useQuery({
    queryKey: [...FINANCE_KEY, 'customer-money'],
    queryFn: () => expectStatus(api.billing.listCustomerMoney({ query: { limit: 50 } }), 200),
  });

/** The invoice PDF through the web app's API proxy, opened in a new tab. */
export const invoicePdfHref = (id: string) =>
  `/api/v1/finance/invoices/${id}/pdf?disposition=inline`;
