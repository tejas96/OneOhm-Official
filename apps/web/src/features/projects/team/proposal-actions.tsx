'use client';

import type { ProjectTask } from '@oneohm/api-contracts';
import { Button, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssignDialog } from '@/features/projects/tasks/assign-dialog';
import { useInvalidateWork } from '@/features/projects/tasks/use-task-actions';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan, useCurrentUser } from '@/providers/current-user';
import { proposalRights } from './proposal-rights';

/** True when a task is only proposed to someone and still waits for a manager's yes. */
export function isProposed(task: ProjectTask): boolean {
  return task.proposedAssignee !== null && task.assignee === null && task.status !== 'completed';
}

/** Confirm the proposed person, or pick someone else (PRD 3.8). Shared by the project card and the task panel. */
export function ProposalActions({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projectTeam.confirm');
  const toast = useToast();
  const invalidate = useInvalidateWork();
  const canAssign = useCan('tasks.assign');
  const viewer = useCurrentUser();
  const [picking, setPicking] = useState(false);
  const confirm = useMutation({
    mutationFn: (userId: string | null) => {
      if (!userId) throw new Error(t('nobody'));
      return expectStatus(
        api.projectTeam.confirmAssignee({ params: { id: task.id }, body: { userId } }),
        200,
      );
    },
    onSuccess: async (saved) => {
      await invalidate();
      toast({
        tone: 'success',
        title: t('confirmed', { name: saved.assignee?.fullName ?? '', task: saved.title }),
      });
    },
  });
  const proposed = task.proposedAssignee;
  const rights = proposalRights({
    canAssign,
    viewerId: viewer.id,
    proposedId: proposed?.id ?? null,
  });
  if (!rights.pick) return null;
  const confirmProposed = () =>
    proposed &&
    confirm
      .mutateAsync(proposed.id)
      .catch((error: unknown) => toast({ title: describeError(error), tone: 'error' }));
  return (
    <div className="flex shrink-0 flex-wrap gap-2">
      {proposed && rights.confirm && (
        <Button
          size="sm"
          variant="primary"
          leadingIcon={<UserCheck />}
          pending={confirm.isPending && confirm.variables === proposed.id}
          onClick={confirmProposed}
        >
          {t('confirm')}
        </Button>
      )}
      <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
        {t('pick')}
      </Button>
      <AssignDialog task={task} open={picking} onOpenChange={setPicking} mutation={confirm} />
    </div>
  );
}
