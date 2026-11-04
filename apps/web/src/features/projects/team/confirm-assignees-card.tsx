'use client';

import type { ProjectDetail, ProjectTask } from '@oneohm/api-contracts';
import { Card, CardHeader } from '@oneohm/design-system/web';
import { useFormatter, useTranslations } from 'next-intl';
import { useCan } from '@/providers/current-user';
import { isProposed, ProposalActions } from './proposal-actions';

function ProposedRow({ task }: { readonly task: ProjectTask }) {
  const t = useTranslations('projectTeam.confirm');
  const stageT = useTranslations('stages');
  const format = useFormatter();
  const proposed = task.proposedAssignee;
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
      <ProposalActions task={task} />
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
  const waiting = project.tasks.filter(isProposed);
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
