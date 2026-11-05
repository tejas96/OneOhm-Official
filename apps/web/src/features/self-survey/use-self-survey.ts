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
