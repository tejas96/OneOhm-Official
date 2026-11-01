'use client';

import type { BusinessReportName } from '@oneohm/api-contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useCenterFilters } from '@/features/command-center/use-center-filters';
import { api, expectStatus } from '@/lib/api/api-client';

const reports = api.businessReports;

/** The open report with the shared filters; the old numbers stay (dimmed) while new load. */
function useReport<T>(
  name: BusinessReportName,
  load: (query: ReturnType<typeof useCenterFilters>['query']) => Promise<T>,
) {
  const { query } = useCenterFilters();
  return useQuery({
    queryKey: ['business-reports', name, query],
    queryFn: () => load(query),
    placeholderData: keepPreviousData,
  });
}

export const useSalesReport = () =>
  useReport('sales', (query) => expectStatus(reports.salesReport({ query }), 200));
export const useDeliveryReport = () =>
  useReport('delivery', (query) => expectStatus(reports.deliveryReport({ query }), 200));
export const useDelaysReport = () =>
  useReport('delays', (query) => expectStatus(reports.delaysReport({ query }), 200));
export const useCollectionsReport = () =>
  useReport('collections', (query) => expectStatus(reports.collectionsReport({ query }), 200));
export const useProfitabilityReport = () =>
  useReport('profitability', (query) => expectStatus(reports.profitabilityReport({ query }), 200));
export const useTeamReport = () =>
  useReport('team', (query) => expectStatus(reports.teamReport({ query }), 200));
export const useServiceReport = () =>
  useReport('service', (query) => expectStatus(reports.serviceReport({ query }), 200));
