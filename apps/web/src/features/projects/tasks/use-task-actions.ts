'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { useToast } from '@oneohm/design-system/web';
import type { WaitingParty } from '@oneohm/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';

/**
 * Everything a task change can move: the project, lists, my tasks, the owner's view and
 * the team views (workload, points).
 */
export function useInvalidateWork() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['project'] }),
      client.invalidateQueries({ queryKey: ['projects'] }),
      client.invalidateQueries({ queryKey: ['tasks'] }),
      client.invalidateQueries({ queryKey: ['command-center'] }),
      client.invalidateQueries({ queryKey: ['team'] }),
    ]);
}

export interface CompleteInput {
  readonly facts: Record<string, string>;
  readonly note: string | null;
  /** A manager's reason to hand over before the material is reconciled (PRD 3.17). */
  readonly materialOverride?: string;
}

/**
 * One hook per task with every action it supports. Quick actions (start, approve)
 * report errors as toasts; dialog actions (waiting, complete, assign) leave the
 * error on the mutation so the dialog can show it beside the fields.
 */
export function useTaskActions(task: ProjectTask) {
  const t = useTranslations('projects.task.toast');
  const toast = useToast();
  const invalidate = useInvalidateWork();
  const params = { id: task.id };

  const done = (title: string) => async () => {
    await invalidate();
    toast({ title, description: task.title, tone: 'success' });
  };
  const failed = (error: unknown) =>
    toast({ title: t('failed'), description: describeError(error), tone: 'error' });

  const start = useMutation({
    mutationFn: () => expectStatus(api.tasks.startTask({ params }), 200),
    onSuccess: done(t('started')),
    onError: failed,
  });
  const approve = useMutation({
    mutationFn: () => expectStatus(api.tasks.approveTask({ params }), 200),
    onSuccess: done(t('approved')),
    onError: failed,
  });
  const waiting = useMutation({
    mutationFn: (input: { party: WaitingParty; note: string | null }) =>
      expectStatus(api.tasks.markWaiting({ params, body: input }), 200),
    onSuccess: done(t('waiting')),
  });
  const complete = useMutation({
    mutationFn: (input: CompleteInput) =>
      expectStatus(api.tasks.completeTask({ params, body: input }), 200),
    onSuccess: async (result) => {
      await invalidate();
      toast({
        title: result.status === 'in_review' ? t('sentForReview') : t('completed'),
        description: task.title,
        tone: 'success',
      });
    },
  });
  const assign = useMutation({
    mutationFn: (userId: string | null) =>
      expectStatus(api.tasks.assignTask({ params, body: { userId } }), 200),
    onSuccess: done(t('assigned')),
  });

  const reschedule = useMutation({
    mutationFn: (input: { dueDate: string; reason: string }) =>
      expectStatus(api.tasks.rescheduleTask({ params, body: input }), 200),
    onSuccess: done(t('rescheduled')),
  });
  const sendBack = useMutation({
    mutationFn: (reason: string) =>
      expectStatus(api.tasks.returnTask({ params, body: { reason } }), 200),
    onSuccess: done(t('returned')),
  });
  const postUpdate = useMutation({
    mutationFn: (note: string) =>
      expectStatus(api.tasks.postTaskUpdate({ params, body: { note } }), 200),
    onSuccess: done(t('updated')),
  });

  return { start, approve, waiting, complete, assign, reschedule, sendBack, postUpdate };
}
