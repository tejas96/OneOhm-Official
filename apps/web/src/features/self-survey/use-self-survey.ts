'use client';

import type { SelfSurveyView } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

export const selfSurveyKey = (taskId: string) => ['self-survey', taskId];

/** The self survey of a survey step, or null when none was offered. */
export function useSelfSurvey(taskId: string, enabled: boolean) {
  return useQuery({
    queryKey: selfSurveyKey(taskId),
    queryFn: () => expectStatus(api.selfSurvey.selfSurvey({ query: { taskId } }), 200),
    enabled,
  });
}

/** Ask again and book a visit: both refresh the survey, the asks card and the task. */
export function useSurveyChoices(taskId: string) {
  const t = useTranslations('selfSurvey');
  const toast = useToast();
  const client = useQueryClient();
  const done = async (title: string) => {
    await Promise.all(
      [['self-survey'], ['document-requests'], ['projects'], ['visits']].map((queryKey) =>
        client.invalidateQueries({ queryKey }),
      ),
    );
    toast({ tone: 'success', title });
  };
  const failed = (error: unknown) =>
    toast({ tone: 'error', title: t('failed'), description: describeError(error) });
  return {
    askAgain: useMutation({
      mutationFn: (input: { readonly id: string; readonly items: SelfSurveyView['askAgain'] }) =>
        expectStatus(
          api.selfSurvey.askSurveyAgain({
            params: { id: input.id },
            body: { items: [...input.items] },
          }),
          200,
        ),
      onSuccess: () => done(t('asked')),
      onError: failed,
    }),
    visit: useMutation({
      mutationFn: (id: string) =>
        expectStatus(api.selfSurvey.surveyVisitInstead({ params: { id }, body: undefined }), 200),
      onSuccess: () => done(t('visited')),
      onError: failed,
    }),
    taskId,
  };
}

export const surveyCreditsKey = (projectId: string) => ['self-survey-credits', projectId];

/** The project's self-survey discount and where it stands. */
export function useSurveyCredits(projectId: string, enabled: boolean) {
  return useQuery({
    queryKey: surveyCreditsKey(projectId),
    queryFn: () => expectStatus(api.selfSurvey.surveyCredits({ query: { projectId } }), 200),
    enabled,
  });
}

/** Finance marks a pending discount as given another way. */
export function useSettleCredit(projectId: string) {
  const t = useTranslations('selfSurvey.credit');
  const toast = useToast();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { readonly id: string; readonly reason: string }) =>
      expectStatus(
        api.selfSurvey.settleSurveyCredit({
          params: { id: input.id },
          body: { reason: input.reason },
        }),
        200,
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: surveyCreditsKey(projectId) });
      toast({ tone: 'success', title: t('settled') });
    },
    onError: (error) =>
      toast({ tone: 'error', title: t('failed'), description: describeError(error) }),
  });
}
