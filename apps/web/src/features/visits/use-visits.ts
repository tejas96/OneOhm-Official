'use client';

import type { SetVisit, VisitScope } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const visitsKey = (scope: VisitScope) => ['visits', scope];

/** The visits of a task, lead or service request and the days the crew is free. */
export function useVisits(scope: VisitScope, enabled = true) {
  return useQuery({
    queryKey: visitsKey(scope),
    queryFn: () => expectStatus(api.visits.visitsOf({ query: scope }), 200),
    enabled,
  });
}

/** Every change to a visit refreshes the visit, the asks card and the screens that show its day. */
export function useVisitMutations(scope: VisitScope) {
  const t = useTranslations('visits');
  const toast = useToast();
  const client = useQueryClient();
  const refresh = async (title: string) => {
    await Promise.all(
      [['visits'], ['document-requests'], ['service'], ['projects'], ['leads']].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
    toast({ tone: 'success', title });
  };
  const failed = (error: unknown) =>
    toast({ tone: 'error', title: t('failed'), description: describeError(error) });
  return {
    set: useMutation({
      mutationFn: (day: Pick<SetVisit, 'day' | 'slot'>) =>
        expectStatus(api.visits.setVisit({ body: { ...scope, ...day } }), 200),
      onSuccess: () => refresh(t('saved')),
      onError: failed,
    }),
    cancel: useMutation({
      mutationFn: (id: string) =>
        expectStatus(api.visits.cancelVisit({ params: { id }, body: {} }), 200),
      onSuccess: () => refresh(t('cancelled')),
      onError: failed,
    }),
    done: useMutation({
      mutationFn: (id: string) =>
        expectStatus(api.visits.doneVisit({ params: { id }, body: undefined }), 200),
      onSuccess: () => refresh(t('doneSaved')),
      onError: failed,
    }),
  };
}
