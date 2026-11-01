'use client';

import type { ProjectDetail } from '@oneohm/api-contracts';
import { cn } from '@oneohm/design-system/web';
import { EPC_STAGES } from '@oneohm/domain';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/providers/current-user';
import { TaskCard } from '../tasks/task-card';
import { inScope, type TaskScope } from './task-scope';

/** Every task, stage by stage, with its one next step; finished work folds away. */
export function TaskBoard({
  project,
  scope,
}: {
  readonly project: ProjectDetail;
  readonly scope: TaskScope;
}) {
  const t = useTranslations('projects.board');
  const stagesT = useTranslations('stages');
  const user = useCurrentUser();
  const stages = EPC_STAGES.map((stage) => {
    const all = project.tasks.filter((task) => task.stage === stage);
    return {
      stage,
      all,
      done: all.filter((task) => task.status === 'completed').length,
      shown: all.filter((task) => inScope(task, scope, user.id)),
    };
  }).filter((group) => (scope === 'mine' ? group.shown.length > 0 : group.all.length > 0));

  return (
    <ol className="flex flex-col gap-8">
      {stages.map((group) => (
        <li key={group.stage} className="flex flex-col">
          <div className="flex items-center gap-3 border-b border-hairline pb-2.5">
            <span
              className={cn(
                'size-2 rounded-full',
                group.done === group.all.length
                  ? 'bg-on-track'
                  : group.stage === project.currentStage
                    ? 'bg-accent'
                    : 'bg-rule',
              )}
            />
            <h3 className="type-title-md text-ink">{stagesT(group.stage)}</h3>
            <span className="font-mono text-[0.75rem] text-ink-faint">
              {group.done}/{group.all.length}
            </span>
          </div>
          {group.shown.length === 0 ? (
            <p className="py-3 type-body-sm text-ink-faint">{t('stageDone')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-hairline">
              {group.shown.map((task, index) => (
                <TaskCard key={task.id} task={task} index={index} />
              ))}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
