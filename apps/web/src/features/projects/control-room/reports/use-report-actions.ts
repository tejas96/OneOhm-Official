'use client';

import type { ReportKey, ReportStatus } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { checklistKey } from '@/features/documents/requests/use-document-requests';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/**
 * Marking a report as submitted (or undoing it) and recording report details. Both
 * answer with the project's report statuses; the project page and documents refresh.
 */
export function useReportActions(projectId: string) {
  const t = useTranslations('projects.reports');
  const toast = useToast();
  const client = useQueryClient();
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['project', projectId] }),
      client.invalidateQueries({ queryKey: ['documents'] }),
      client.invalidateQueries({ queryKey: checklistKey(projectId) }),
    ]);
  };
  const submission = useMutation({
    mutationFn: (input: { key: ReportKey; submitted: boolean }) =>
      expectStatus(
        api.reports.markReportSubmitted({
          params: { id: projectId, reportKey: input.key },
          body: { submitted: input.submitted },
        }),
        200,
      ),
    onSuccess: async (statuses: ReportStatus[], input) => {
      await refresh();
      const name = statuses.find((status) => status.key === input.key)?.name ?? '';
      toast({ tone: 'success', title: t(input.submitted ? 'submittedDone' : 'undone', { name }) });
    },
    onError: (error) => toast({ tone: 'error', title: describeError(error) }),
  });
  const facts = useMutation({
    mutationFn: (values: Record<string, string>) =>
      expectStatus(
        api.reports.recordReportFacts({ params: { id: projectId }, body: { facts: values } }),
        200,
      ),
    onSuccess: async () => {
      await refresh();
      toast({ tone: 'success', title: t('factsSaved') });
    },
  });
  return { submission, facts };
}
