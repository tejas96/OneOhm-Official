'use client';

import type { ProjectDetail, ProjectTask } from '@oneohm/api-contracts';
import { Button, Card, CardHeader, useToast } from '@oneohm/design-system/web';
import { useMutation } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { AssignDialog } from '@/features/projects/tasks/assign-dialog';
import { useInvalidateWork } from '@/features/projects/tasks/use-task-actions';
import { api, expectStatus } from '@/lib/api/api-client';
import { describeError } from '@/lib/api/api-error';
import { useCan } from '@/providers/current-user';

function ProposedRow({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projectTeam.confirm');
  const stageT = useTranslations('stages');
  const format = useFormatter();
  const toast = useToast();
  const invalidate = useInvalidateWork();
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
  const confirmProposed = () =>
    proposed &&
    confirm
      .mutateAsync(proposed.id)
      .catch((error: unknown) => toast({ title: describeError(error), tone: 'error' }));
  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-body-sm font-medium text-ink">{task.title}</p>
        <p className="type-label text-ink-faint">
          {stageT(task.stage)} ·{' '}
          {format.dateTime(new Date(`${task.dueDate}T00:00:00`), {
            day: 'numeric',
            month: 'short',
          })}
          {' · '}
          {proposed ? t('proposed', { name: proposed.fullName }) : t('nobody')}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {proposed && (
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
      </div>
      <AssignDialog task={task} open={picking} onOpenChange={setPicking} mutation={confirm} />
    </li>
  );
}

/**
 * Critical tasks the engine only proposed (PRD 3.8): a manager confirms the person or
 * picks another before anyone is told.
 */
export function ConfirmAssigneesCard({ project }: { readonly project: ProjectDetail }) {
  const t = useTranslations('projectTeam.confirm');
  const canAssign = useCan('tasks.assign');
  const waiting = project.tasks.filter(
    (task) =>
      task.proposedAssignee !== null && task.assignee === null && task.status !== 'completed',
  );
  if (!canAssign || waiting.length === 0) return null;
  return (
    <Card>
      <CardHeader title={t('title')} description={t('description')} />
      <ul className="flex flex-col divide-y divide-hairline px-5 pb-5">
        {waiting.map((task) => (
          <ProposedRow key={task.id} task={task} />
        ))}
      </ul>
    </Card>
  );
}
