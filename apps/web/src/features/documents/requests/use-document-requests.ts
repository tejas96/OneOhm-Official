'use client';

import type { DocumentRequest, NewDocumentRequest } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/** Where the asked papers are listed and asked from: a project, a lead or a customer. */
export type ActionScope =
  | { readonly projectId: string }
  | { readonly leadId: string }
  | { readonly customerId: string };

export const requestsKey = (scope: ActionScope) => ['document-requests', scope];
export const checklistKey = (projectId: string) => ['projects', projectId, 'document-checklist'];

/** Papers asked from the customer, open first. */
export function useDocumentRequests(scope: ActionScope) {
  return useQuery({
    queryKey: requestsKey(scope),
    queryFn: () => expectStatus(api.documentRequests.listDocumentRequests({ query: scope }), 200),
  });
}

/** Every list of asked papers, every project checklist and the documents change together. */
function useRefresh() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['document-requests'] }),
      client.invalidateQueries({
        predicate: ({ queryKey }) =>
          queryKey[0] === 'projects' && queryKey[2] === 'document-checklist',
      }),
      client.invalidateQueries({ queryKey: ['documents'] }),
    ]);
}

/** One paper to ask for; `requirementKey` is the checklist row it comes from. */
export type AskItem = Pick<NewDocumentRequest, 'category' | 'title' | 'requirementKey'>;

/** Asks for each paper in turn (the same note on all); every one that went is told apart from those that did not. */
export function useAskCustomer(scope: ActionScope, onDone: () => void) {
  const t = useTranslations('documents.requests.sheet');
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: async ({ items, note }: { items: readonly AskItem[]; note: string }) => {
      for (const item of items) {
        const body = { ...scope, ...item, note } as NewDocumentRequest;
        await expectStatus(api.documentRequests.createDocumentRequest({ body }), 201);
      }
      return items.length;
    },
    onSuccess: async (count) => {
      await refresh();
      onDone();
      toast({ tone: 'success', title: t('sent', { count }) });
    },
    // The ones before the failing paper were asked: the lists show them.
    onError: () => refresh(),
  });
}

export function useCancelRequest() {
  const t = useTranslations('documents.requests');
  const toast = useToast();
  const refresh = useRefresh();
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

/** "Not right, ask again": the request opens again with a reason the customer sees. */
export function useReaskRequest(onDone: () => void) {
  const t = useTranslations('documents.requests.reask');
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      expectStatus(
        api.documentRequests.reaskDocumentRequest({ params: { id }, body: { note } }),
        200,
      ),
    onSuccess: async (request) => {
      await refresh();
      onDone();
      toast({ tone: 'success', title: t('sent'), description: request.title });
    },
  });
}

/** "Looks good": the papers are checked and the request they answer closes. */
export function useCheckPapers() {
  const t = useTranslations('documents.requests');
  const toast = useToast();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (documentIds: readonly string[]) =>
      Promise.all(
        documentIds.map((id) =>
          expectStatus(api.documents.checkDocument({ params: { id }, body: {} }), 200),
        ),
      ),
    onSuccess: async () => {
      await refresh();
      toast({ tone: 'success', title: t('checked') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('checkFailed'), description: describeError(error) }),
  });
}
