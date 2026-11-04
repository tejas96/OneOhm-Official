'use client';

import type { DocumentRequest, NewDocumentRequest } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const requestsKey = (projectId: string) => ['projects', projectId, 'document-requests'];
export const checklistKey = (projectId: string) => ['projects', projectId, 'document-checklist'];

/** Papers asked from this project's customer, open first. */
export function useDocumentRequests(projectId: string) {
  return useQuery({
    queryKey: requestsKey(projectId),
    queryFn: () =>
      expectStatus(api.documentRequests.listDocumentRequests({ query: { projectId } }), 200),
  });
}

function useRefresh(projectId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: requestsKey(projectId) }),
      client.invalidateQueries({ queryKey: checklistKey(projectId) }),
    ]);
}

export function useAskCustomer(projectId: string, onDone: () => void) {
  const t = useTranslations('documents.requests.sheet');
  const toast = useToast();
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (body: Omit<NewDocumentRequest, 'projectId'>) =>
      expectStatus(
        api.documentRequests.createDocumentRequest({ body: { ...body, projectId } }),
        201,
      ),
    onSuccess: async (request) => {
      await refresh();
      onDone();
      toast({ tone: 'success', title: t('sent'), description: request.title });
    },
  });
}

export function useCancelRequest(projectId: string) {
  const t = useTranslations('documents.requests');
  const toast = useToast();
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: (request: DocumentRequest) =>
      expectStatus(
        api.documentRequests.cancelDocumentRequest({ params: { id: request.id }, body: {} }),
        200,
      ),
    onSuccess: async (request) => {
      await refresh();
      toast({ tone: 'success', title: t('cancelled'), description: request.title });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('cancelFailed'), description: describeError(error) }),
  });
}

/** "Not right, ask again": the request opens again with a note the customer sees. */
export function useReaskRequest(projectId: string, onDone: () => void) {
  const t = useTranslations('documents.requests.reask');
  const toast = useToast();
  const client = useQueryClient();
  const refresh = useRefresh(projectId);
  return useMutation({
    mutationFn: ({ request, note }: { request: DocumentRequest; note: string }) =>
      expectStatus(
        api.documentRequests.reaskDocumentRequest({ params: { id: request.id }, body: { note } }),
        200,
      ),
    onSuccess: async (request) => {
      // The paper is taken off, so the project's files change too.
      await Promise.all([refresh(), client.invalidateQueries({ queryKey: ['documents'] })]);
      onDone();
      toast({ tone: 'success', title: t('sent'), description: request.title });
    },
  });
}
