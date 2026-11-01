'use client';

import type { Customer, Lead, ProjectSummary, QuotationSummary } from '@oneohm/api-contracts';
import type { Capability } from '@oneohm/domain';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { api, expectStatus } from '@/lib/api/api-client';
import { useCurrentUser } from '@/providers/current-user';

/** A small business: the whole list is a few hundred rows, so the palette filters locally. */
const STALE_MS = 60_000;
const NONE: readonly never[] = [];

export interface SearchRecords {
  readonly projects: readonly ProjectSummary[];
  readonly customers: readonly Customer[];
  readonly leads: readonly Lead[];
  readonly quotations: readonly QuotationSummary[];
  /** At least one list the person may see is still on its way. */
  readonly loading: boolean;
  /** At least one list could not load; the rest still search. */
  readonly failed: boolean;
  /** The person may see at least one kind of record (else the palette finds pages only). */
  readonly searchable: boolean;
}

/**
 * The lists behind the palette, fetched only for what this person may open (the API
 * guards the same capabilities). Mounted with the open palette, so nothing loads until
 * it is first used. The keys match the list screens, so a visited screen answers at once.
 */
export function useSearchRecords(): SearchRecords {
  const user = useCurrentUser();
  const can = (...capabilities: Capability[]) =>
    capabilities.some((capability) => user.capabilities.includes(capability));

  const allowed = {
    projects: can('projects.view_all'),
    customers: can('customers.view'),
    leads: can('leads.view_all', 'leads.view_own', 'leads.manage'),
    quotations: can('quotations.view', 'quotations.create'),
  };

  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => expectStatus(api.projects.listProjects(), 200),
    enabled: allowed.projects,
    staleTime: STALE_MS,
  });
  const customers = useQuery({
    queryKey: ['customers', 'list', ''],
    queryFn: () => expectStatus(api.crm.listCustomers({ query: {} }), 200),
    enabled: allowed.customers,
    staleTime: STALE_MS,
  });
  const leads = useQuery({
    queryKey: ['leads', 'list', 'all', ''],
    queryFn: () => expectStatus(api.crm.listLeads({ query: {} }), 200),
    enabled: allowed.leads,
    staleTime: STALE_MS,
  });
  const quotations = useQuery({
    queryKey: ['quotations'],
    queryFn: () => expectStatus(api.quotations.listQuotations({ query: {} }), 200),
    enabled: allowed.quotations,
    staleTime: STALE_MS,
  });

  const sources: readonly UseQueryResult<unknown>[] = [projects, customers, leads, quotations];
  // A disabled query stays "pending" without fetching; only count the ones on their way.
  const loading = sources.some((source) => source.isPending && source.fetchStatus === 'fetching');
  const failed = sources.some((source) => source.isError);
  const searchable = Object.values(allowed).some(Boolean);
  return useMemo(
    () => ({
      projects: projects.data ?? NONE,
      customers: customers.data ?? NONE,
      leads: leads.data ?? NONE,
      quotations: quotations.data ?? NONE,
      loading,
      failed,
      searchable,
    }),
    [projects.data, customers.data, leads.data, quotations.data, loading, failed, searchable],
  );
}
