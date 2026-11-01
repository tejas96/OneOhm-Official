'use client';

import type { ChangeRequestTypeInput, ReportFormatInput } from '@oneohm/api-contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, expectStatus } from '@/lib/api/api-client';

export const SETUP_KEYS = {
  changeTypes: (discomId: string) => ['settings', 'change-types', discomId] as const,
  formats: (discomId: string) => ['settings', 'report-formats', discomId] as const,
  reportList: ['report-settings'] as const,
};

/** One DISCOM's change-request types (Settings → DISCOMs). */
export function useChangeTypes(discomId: string | null) {
  return useQuery({
    queryKey: SETUP_KEYS.changeTypes(discomId ?? ''),
    queryFn: () =>
      expectStatus(
        api.changeRequestTypes.listChangeRequestTypes({ params: { id: discomId ?? '' } }),
        200,
      ),
    enabled: Boolean(discomId),
  });
}

/** One DISCOM's report formats. */
export function useReportFormats(discomId: string | null) {
  return useQuery({
    queryKey: SETUP_KEYS.formats(discomId ?? ''),
    queryFn: () =>
      expectStatus(api.reportFormats.listReportFormats({ params: { id: discomId ?? '' } }), 200),
    enabled: Boolean(discomId),
  });
}

/** Every report any DISCOM prints, by key and name, for task triggers and message links. */
export function useReportList() {
  return useQuery({
    queryKey: SETUP_KEYS.reportList,
    queryFn: () => expectStatus(api.reportSettings.listReportSettings(), 200),
    staleTime: 60_000,
    select: (settings) => settings.map(({ key, name }) => ({ key, name })),
  });
}

/** Saves a change type (new when `id` is null) and refreshes the DISCOM's list. */
export function useSaveChangeType(discomId: string) {
  const client = useQueryClient();
  return async (id: string | null, body: ChangeRequestTypeInput) => {
    const saved = id
      ? await expectStatus(
          api.changeRequestTypes.updateChangeRequestType({ params: { id }, body }),
          200,
        )
      : await expectStatus(
          api.changeRequestTypes.createChangeRequestType({ params: { id: discomId }, body }),
          201,
        );
    await client.invalidateQueries({ queryKey: SETUP_KEYS.changeTypes(discomId) });
    return saved;
  };
}

/** Saves a report format (new when `id` is null) and refreshes what depends on it. */
export function useSaveReportFormat(discomId: string) {
  const client = useQueryClient();
  return async (id: string | null, body: ReportFormatInput) => {
    const saved = id
      ? await expectStatus(api.reportFormats.updateReportFormat({ params: { id }, body }), 200)
      : await expectStatus(
          api.reportFormats.createReportFormat({ params: { id: discomId }, body }),
          201,
        );
    await client.invalidateQueries({ queryKey: SETUP_KEYS.formats(discomId) });
    await client.invalidateQueries({ queryKey: SETUP_KEYS.reportList });
    return saved;
  };
}
