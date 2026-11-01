'use client';

import type { ProjectChangeInput } from '@oneohm/api-contracts';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useDebouncedValue } from '@/features/quotations/use-debounced-value';
import { api, expectStatus } from '@/lib/api/api-client';
import { ApiError } from '@/lib/api/api-error';

export const changesKey = (projectId: string) => ['project-changes', projectId] as const;

/** Open and past scope changes on a project, newest first. */
export function useProjectChanges(projectId: string) {
  return useQuery({
    queryKey: changesKey(projectId),
    queryFn: () =>
      expectStatus(api.projectChanges.listProjectChanges({ params: { id: projectId } }), 200),
  });
}

/** The change's impact while it is being filled in; the last answer stays while typing. */
export function useChangePreview(projectId: string, input: ProjectChangeInput | null) {
  const settled = useDebouncedValue(input, 400);
  const query = useQuery({
    queryKey: ['project-change-preview', projectId, settled],
    queryFn: () =>
      expectStatus(
        api.projectChanges.previewProjectChange({
          params: { id: projectId },
          body: settled as ProjectChangeInput,
        }),
        200,
      ),
    enabled: settled !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const error = input && query.isError ? query.error : null;
  return {
    impact: input ? query.data : undefined,
    updating: input !== null && (input !== settled || query.isFetching),
    error,
    fieldErrors: error instanceof ApiError ? error.fieldErrors : {},
  };
}

/** Raise, approve and withdraw; the project, its changes and quotations refresh after. */
export function useChangeActions(projectId: string) {
  const client = useQueryClient();
  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: changesKey(projectId) }),
      client.invalidateQueries({ queryKey: ['project', projectId] }),
      client.invalidateQueries({ queryKey: ['quotation'] }),
    ]);
  }, [client, projectId]);
  const raise = useCallback(
    async (body: ProjectChangeInput) => {
      const change = await expectStatus(
        api.projectChanges.raiseProjectChange({ params: { id: projectId }, body }),
        201,
      );
      await refresh();
      return change;
    },
    [projectId, refresh],
  );
  const approve = useCallback(
    async (id: string) => {
      const change = await expectStatus(
        api.projectChanges.approveProjectChange({ params: { id } }),
        200,
      );
      await refresh();
      return change;
    },
    [refresh],
  );
  const withdraw = useCallback(
    async (id: string, reason: string) => {
      const change = await expectStatus(
        api.projectChanges.withdrawProjectChange({ params: { id }, body: { reason } }),
        200,
      );
      await refresh();
      return change;
    },
    [refresh],
  );
  return { raise, approve, withdraw };
}
